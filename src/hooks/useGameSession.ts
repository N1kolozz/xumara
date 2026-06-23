import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Room, Player, GameState } from "@/types/game";

// How long a player may be missing from Realtime Presence before the room
// evicts them. Long enough to ride out a phone backgrounding the tab or a brief
// network blip, short enough that genuinely-closed tabs don't leave the room
// lingering for long.
const ABSENCE_GRACE_MS = 15000;

// How often each client stamps players.last_seen. Must be comfortably below the
// server sweep's 120s staleness window so a live player is never swept.
const HEARTBEAT_MS = 20000;

// If Realtime Presence hasn't synced within this long (e.g. realtime is down),
// stop waiting and render the lobby from the DB list anyway.
const PRESENCE_SYNC_FALLBACK_MS = 2500;

export const useGameSession = (roomId: string | undefined) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  // Player ids currently connected to the room channel (Realtime Presence).
  // Drives the lobby list so a tab-closer disappears within seconds, without
  // waiting on the DB row to be pruned.
  const [onlinePlayerIds, setOnlinePlayerIds] = useState<string[]>([]);
  // True once presence has synced at least once (or we gave up waiting). The
  // lobby holds off rendering its list until this flips so a just-departed
  // player doesn't flash in from the initial DB fetch before presence arrives.
  const [presenceReady, setPresenceReady] = useState(false);

  const playersRef = useRef<Player[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Pending "evict this absent player" timers, keyed by player id.
  const pruneTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Set by subscribeToRealtime so loadRoomData can re-check presence once the
  // initial player list lands.
  const reconcilePresenceRef = useRef<() => void>(() => {});

  const loadRoomData = async () => {
    if (!roomId) return;
    
    setLoading(true);
    const { data: roomData, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (roomError || !roomData) {
      toast({
        title: "ოთახი ვერ მოიძებნა",
        description: "ასეთი ოთახი არ არსებობს",
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    setRoom(roomData as Room);

    const { data: playersData } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });

    if (playersData) {
      const typedPlayers = playersData as Player[];
      setPlayers(typedPlayers);
      playersRef.current = typedPlayers;

      const playerId = sessionStorage.getItem(`player_${roomId}`) || localStorage.getItem(`player_${roomId}`);
      if (playerId) {
        sessionStorage.setItem(`player_${roomId}`, playerId);
        const player = typedPlayers.find((p) => p.id === playerId);
        if (player) setCurrentPlayer(player);
      }
    }

    if (roomData.status === "playing") {
      const { data: gameStateData } = await supabase
        .from("game_state")
        .select("*")
        .eq("room_id", roomId)
        .single();

      if (gameStateData) {
        setGameState(gameStateData as GameState);
      }
    }
    
    setLoading(false);

    // The player list is now known — schedule eviction for anyone who isn't
    // actually connected to the room channel.
    reconcilePresenceRef.current();
  };

  const subscribeToRealtime = () => {
    if (!roomId) return () => {};

    setPresenceReady(false);
    // Don't wait forever for presence — if realtime is slow/unavailable, reveal
    // the lobby list anyway after a short grace.
    const presenceFallback = setTimeout(() => setPresenceReady(true), PRESENCE_SYNC_FALLBACK_MS);

    const getCurrentPlayerId = () => {
      return sessionStorage.getItem(`player_${roomId}`) || localStorage.getItem(`player_${roomId}`);
    };

    const channel = supabase.channel(`room_${roomId}`, {
      config: { presence: { key: getCurrentPlayerId() ?? undefined } },
    });
    channelRef.current = channel;

    // ── Presence-driven ghost-room cleanup ──────────────────────────────────
    // Every client tracks its presence on the room channel. When a player's
    // connection drops (tab closed, app killed, network lost) they fall out of
    // the presence state. After a grace period a single elected client removes
    // their now-stale player row; removing the last one fires the empty-room
    // trigger and the room (plus everything that cascades off it) is deleted.
    const pruneIfJanitor = async (absentId: string) => {
      const presentIds = Object.keys(channel.presenceState());
      if (presentIds.length === 0) return;        // nobody left to do the cleanup
      if (presentIds.includes(absentId)) return;  // they reconnected within the grace window
      // Deterministically elect one janitor so every remaining client doesn't
      // fire the RPC at once.
      const janitor = [...presentIds].sort()[0];
      if (getCurrentPlayerId() !== janitor) return;
      await supabase.rpc("prune_absent_player", { p_room_id: roomId, p_player_id: absentId });
    };

    const reconcilePresence = () => {
      const presentIds = new Set(Object.keys(channel.presenceState()));
      const dbIds = new Set(playersRef.current.map((p) => p.id));
      const timers = pruneTimersRef.current;

      // Publish who's connected so the lobby can hide tab-closers immediately.
      setOnlinePlayerIds([...presentIds]);

      // Cancel pending evictions for anyone who is present again or already gone
      // from the database.
      for (const [pid, timer] of timers) {
        if (presentIds.has(pid) || !dbIds.has(pid)) {
          clearTimeout(timer);
          timers.delete(pid);
        }
      }

      // Schedule eviction for database players who aren't on the channel.
      for (const player of playersRef.current) {
        if (!presentIds.has(player.id) && !timers.has(player.id)) {
          const timer = setTimeout(() => {
            timers.delete(player.id);
            void pruneIfJanitor(player.id);
          }, ABSENCE_GRACE_MS);
          timers.set(player.id, timer);
        }
      }
    };
    reconcilePresenceRef.current = reconcilePresence;

    // Best-effort cleanup for the *last* person leaving: when the tab is being
    // unloaded and we're the only one still connected, remove ourselves so the
    // room doesn't linger. Gated on being alone so backgrounding mid-game with
    // others present doesn't drop our seat (presence handles real disconnects).
    const handlePageHide = () => {
      const pid = getCurrentPlayerId();
      if (!pid) return;
      if (Object.keys(channel.presenceState()).length > 1) return;
      supabase.rpc("leave_room", { p_room_id: roomId, p_player_id: pid });
    };
    window.addEventListener("pagehide", handlePageHide);

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setRoom(payload.new as Room);
          }
        }
      )
      .on('broadcast', { event: 'return_to_lobby' }, (payload) => {
        if (payload.payload) {
          setRoom((prevRoom) => prevRoom ? { ...prevRoom, status: "lobby" } : null);
          const playerName = payload.payload.playerName || "მოთამაშე";
          toast({
            title: "დაბრუნდით ლობიში",
            description: payload.payload.reason === 'judge_left'
              ? `${playerName} დაბრუნდა ლობიში - ამიტომ, ყველა დაბრუნდით ლობიში`
              : `${playerName} დაბრუნდა ლობიში - არასაკმარისი მოთამაშე`,
          });
        }
      })
      // Single source of truth for the player list: any insert/delete/update on
      // a room player re-reads the list and re-checks presence. (A player_left
      // broadcast used to also refetch here, but it duplicated this exact work —
      // and fired before the DB delete had committed, hence its old 300ms hack —
      // so it was removed in favour of this authoritative postgres_changes feed.)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        async () => {
          const currentPlayerId = getCurrentPlayerId();

          const { data: playersData } = await supabase
            .from("players")
            .select("*")
            .eq("room_id", roomId)
            .order("joined_at", { ascending: true });

          if (playersData) {
            const typedPlayers = playersData as Player[];
            setPlayers(typedPlayers);
            playersRef.current = typedPlayers;
            if (currentPlayerId) {
              const updatedCurrentPlayer = typedPlayers.find((p) => p.id === currentPlayerId);
              if (updatedCurrentPlayer) setCurrentPlayer(updatedCurrentPlayer);
            }
            // A player row appeared/disappeared — re-check presence so a stale
            // row gets queued for eviction (or a cleared one cancelled).
            reconcilePresence();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_state", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            setGameState(null);
            setRoom((prev) => (prev ? { ...prev, status: "lobby" } : null));

            const playerId = getCurrentPlayerId();
            if (playerId) {
              setCurrentPlayer((prev) => (prev ? { ...prev, in_game: false } : null));
            }
            await loadRoomData();
          } else if (payload.new) {
            setGameState(payload.new as GameState);
          }
        }
      )
      // Presence is live as soon as the first event arrives — reveal the lobby.
      .on("presence", { event: "sync" }, () => { setPresenceReady(true); reconcilePresence(); })
      .on("presence", { event: "join" }, () => { setPresenceReady(true); reconcilePresence(); })
      .on("presence", { event: "leave" }, () => { setPresenceReady(true); reconcilePresence(); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          const pid = getCurrentPlayerId();
          if (pid) channel.track({ player_id: pid, online_at: new Date().toISOString() });
        }
      });

    return () => {
      clearTimeout(presenceFallback);
      window.removeEventListener("pagehide", handlePageHide);
      for (const timer of pruneTimersRef.current.values()) clearTimeout(timer);
      pruneTimersRef.current.clear();
      reconcilePresenceRef.current = () => {};
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  };

  useEffect(() => {
    loadRoomData();
    const cleanup = subscribeToRealtime();
    return cleanup;
  }, [roomId]);

  // Heartbeat: keep our player's last_seen fresh so the server-side sweep
  // doesn't evict us — and, conversely, so that once we stop beating (tab
  // closed / crashed) the sweep can reclaim our seat and delete the room.
  useEffect(() => {
    if (!roomId) return;
    const getPid = () =>
      sessionStorage.getItem(`player_${roomId}`) || localStorage.getItem(`player_${roomId}`);
    const beat = () => {
      const pid = getPid();
      if (pid) void supabase.rpc("heartbeat", { p_player_id: pid });
    };
    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    // Mobile browsers throttle/suspend timers in backgrounded tabs, so beat
    // immediately when the tab becomes visible again — before the sweep's
    // staleness window can lapse.
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [roomId]);

  return {
    room,
    setRoom,
    players,
    setPlayers,
    gameState,
    setGameState,
    currentPlayer,
    setCurrentPlayer,
    loading,
    channelRef,
    onlinePlayerIds,
    presenceReady,
  };
};
