import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Room, Player, GameState, CardData, Submission } from "@/types/game";

interface UseGameBoardDataProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  gameState: GameState | null;
}

export const useGameBoardData = ({ room, players, currentPlayer, gameState }: UseGameBoardDataProps) => {
  const { toast } = useToast();
  const [inboxCard, setInboxCard] = useState<CardData | null>(null);
  const [playerCards, setPlayerCards] = useState<CardData[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reactions, setReactions] = useState<{ id: string; emoji: string }[]>([]);

  // Holds the submissions realtime channel so we can broadcast reactions on it.
  const reactionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Spawn a floating reaction that removes itself shortly after.
  const addReaction = useCallback((emoji: string) => {
    if (!emoji) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setReactions((prev) => [...prev, { id, emoji }]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 1800);
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    addReaction(emoji); // optimistic — sender sees it immediately
    reactionChannelRef.current?.send({ type: "broadcast", event: "reaction", payload: { emoji } });
  }, [addReaction]);

  // Refs so subscription callbacks always see the latest values without causing
  // subscription teardown/rebuild on every render.
  const gameStateRef = useRef(gameState);
  const roomRef = useRef(room);
  const currentPlayerRef = useRef(currentPlayer);
  const playersRef = useRef(players);

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { currentPlayerRef.current = currentPlayer; }, [currentPlayer]);
  useEffect(() => { playersRef.current = players; }, [players]);

  // Stable function that reads from refs — safe to call inside subscriptions.
  const loadGameData = useCallback(async () => {
    const gs = gameStateRef.current;
    if (!gs) return;

    const rm = roomRef.current;
    const cp = currentPlayerRef.current;
    const pl = playersRef.current;

    const freshPlayerData = pl.find(p => p.id === cp.id);
    const isJudge = freshPlayerData?.is_judge ?? cp.is_judge;

    if (gs.current_inbox_card_id) {
      const { data: inboxData } = await supabase
        .from("cards")
        .select("*")
        .eq("id", gs.current_inbox_card_id)
        .single();
      if (inboxData) setInboxCard(inboxData as CardData);
    }

    if (!isJudge && gs.phase === "submitting") {
      const { data: playerData } = await supabase
        .from("players")
        .select("hand")
        .eq("id", cp.id)
        .single();

      if (playerData?.hand && playerData.hand.length > 0) {
        const { data: cardsData } = await supabase
          .from("cards")
          .select("*")
          .in("id", playerData.hand);
        if (cardsData) {
          setPlayerCards(cardsData as CardData[]);
        }
      } else {
        setPlayerCards([]);
      }
    }

    const { data: submissionsData } = await supabase
      .from("submissions")
      .select("*, cards(*), players(name)")
      .eq("room_id", rm.id)
      .eq("round_number", gs.round_number);

    if (submissionsData) {
      setSubmissions(submissionsData as unknown as Submission[]);
    }
  }, []);

  // Lightweight refresh — only submissions, used by the debounced subscription handler.
  const refreshSubmissions = useCallback(async () => {
    const gs = gameStateRef.current;
    const rm = roomRef.current;
    if (!gs) return;

    const { data: submissionsData } = await supabase
      .from("submissions")
      .select("*, cards(*), players(name)")
      .eq("room_id", rm.id)
      .eq("round_number", gs.round_number);

    if (submissionsData) {
      setSubmissions(submissionsData as unknown as Submission[]);
    }
  }, []);

  useEffect(() => {
    if (!gameState) return;
    loadGameData();

    // Debounce: multiple players submitting in quick succession fire N events.
    // Batch them into a single query after 150 ms of quiet.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefreshSubmissions = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refreshSubmissions, 150);
    };

    const submissionsChannel = supabase.channel(`submissions_${room.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "submissions",
        filter: `room_id=eq.${room.id}`
      }, debouncedRefreshSubmissions)
      .on("broadcast", { event: "round_winner" }, (payload) => {
        toast({
          title: "გამარჯვებული შეირჩა!",
          description: `${payload.payload.winnerName} მოიგო ეს რაუნდი!`
        });
      })
      .on("broadcast", { event: "reaction" }, (payload) => {
        addReaction(payload.payload?.emoji);
      })
      .subscribe();

    reactionChannelRef.current = submissionsChannel;

    const gameStateChannel = supabase.channel(`game_state_${room.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "game_state",
        filter: `room_id=eq.${room.id}`
      }, (payload) => {
        if (payload.eventType === "UPDATE" && payload.new.winner_name && payload.new.winner_score !== null) {
          const isDraw = payload.new.winner_name.includes(",");
          toast({
            title: "თამაში დასრულდა!",
            description: isDraw
              ? `${payload.new.winner_name} მოთამაშეებს შორის დამთავრდა ფრე ${payload.new.winner_score} ქულით!`
              : `${payload.new.winner_name} არის გამარჯვებული ${payload.new.winner_score} ქულით!`
          });
        }
        loadGameData();
      })
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      reactionChannelRef.current = null;
      supabase.removeChannel(submissionsChannel);
      supabase.removeChannel(gameStateChannel);
    };
  // Exclude `players` from deps — we use playersRef so subscriptions aren't
  // torn down and rebuilt on every player-list update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.round_number, gameState?.phase, currentPlayer.id]);

  return {
    inboxCard,
    playerCards,
    setPlayerCards,
    submissions,
    reactions,
    sendReaction,
  };
};
