import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Room, Player, GameState } from "@/types/game";

export const useGameSession = (roomId: string | undefined) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  const playersRef = useRef<Player[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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

      let playerId = sessionStorage.getItem(`player_${roomId}`) || localStorage.getItem(`player_${roomId}`);
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
  };

  const subscribeToRealtime = () => {
    if (!roomId) return () => {};

    const getCurrentPlayerId = () => {
      return sessionStorage.getItem(`player_${roomId}`) || localStorage.getItem(`player_${roomId}`);
    };

    const channel = supabase.channel(`room_${roomId}`);
    channelRef.current = channel;

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setRoom(payload.new as Room);
          } else if (payload.eventType === "DELETE") {
            toast({
              title: "ოთახი წაიშალა",
              description: "ყველა მოთამაშემ დატოვა ოთახი",
            });
            navigate("/");
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
      .on('broadcast', { event: 'players_updated' }, async () => {
        const { data: playersData } = await supabase
          .from("players")
          .select("*")
          .eq("room_id", roomId)
          .order("joined_at", { ascending: true });

        if (playersData) {
          const typedPlayers = playersData as Player[];
          setPlayers(typedPlayers);
          playersRef.current = typedPlayers;
          const currentPlayerId = getCurrentPlayerId();
          if (currentPlayerId) {
            const updatedCurrentPlayer = typedPlayers.find((p) => p.id === currentPlayerId);
            if (updatedCurrentPlayer) setCurrentPlayer(updatedCurrentPlayer);
          }
        }
      })
      .on('broadcast', { event: 'player_left' }, async (payload) => {
        const leftPlayerId = payload.payload?.playerId;
        const leftPlayerName = payload.payload?.playerName;
        const currentPlayerId = getCurrentPlayerId();

        if (currentPlayerId && leftPlayerId === currentPlayerId) return;

        if (leftPlayerName) {
          toast({ title: "მოთამაშე გავიდა", description: `${leftPlayerName} დატოვა ოთახი` });
        }

        await new Promise((resolve) => setTimeout(resolve, 300));
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
        }
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const currentPlayerId = getCurrentPlayerId();
          if (payload.eventType === "INSERT" && payload.new) {
            const newPlayer = payload.new as Player;
            if (currentPlayerId && newPlayer.id !== currentPlayerId) {
              toast({ title: "ახალი მოთამაშე", description: `${newPlayer.name} შემოუერთდა ოთახს` });
            }
          }

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
      .subscribe();

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  };

  useEffect(() => {
    loadRoomData();
    const cleanup = subscribeToRealtime();
    return cleanup;
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
  };
};
