import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Room, Player, GameState, CardData, Submission } from "@/types/game";

interface UseGameBoardDataProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  gameState: GameState | null;
}

export interface RoundWinner {
  name: string;
  playerId: string | null;
  cardText: string | null;
}

export const useGameBoardData = ({ room, players, currentPlayer, gameState }: UseGameBoardDataProps) => {
  const [inboxCard, setInboxCard] = useState<CardData | null>(null);
  const [playerCards, setPlayerCards] = useState<CardData[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reactions, setReactions] = useState<{ id: string; emoji: string }[]>([]);
  // Round-winner celebration overlay: set on the round_winner broadcast,
  // auto-clears a few seconds later (see the dedicated effect below).
  const [roundWinner, setRoundWinner] = useState<RoundWinner | null>(null);

  // Auto-dismiss the round-winner overlay a few seconds after it appears. This
  // lives in its own effect (keyed only on `roundWinner`) so the timer isn't
  // cancelled when the realtime-channel effect tears down on the round advance
  // that immediately follows the broadcast — which previously left the overlay
  // stuck on screen and froze the game between rounds.
  useEffect(() => {
    if (!roundWinner) return;
    const id = window.setTimeout(() => setRoundWinner(null), 3200);
    return () => window.clearTimeout(id);
  }, [roundWinner]);

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

  // Inbox (question) card — fetched in its own effect keyed on
  // game_state.current_inbox_card_id, the single value every client shares.
  // It used to be loaded inside loadGameData(), which runs from several places
  // at once; those overlapping async calls could resolve out of order and let
  // an older fetch win, leaving a stale question on screen while the round had
  // already advanced — so players in the same round saw different questions.
  // Keying off the prop's card id (always fresh, straight from the realtime
  // payload) plus a cancellation flag makes the displayed question
  // deterministic: only the response for the current card id is ever applied.
  useEffect(() => {
    const cardId = gameState?.current_inbox_card_id;
    if (!cardId) {
      setInboxCard(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("cards").select("*").eq("id", cardId).single();
      if (!cancelled && data) setInboxCard(data as CardData);
    })();
    return () => { cancelled = true; };
  }, [gameState?.current_inbox_card_id]);

  // Stable function that reads from refs — safe to call inside subscriptions.
  const loadGameData = useCallback(async () => {
    const gs = gameStateRef.current;
    if (!gs) return;

    const rm = roomRef.current;
    const cp = currentPlayerRef.current;
    const pl = playersRef.current;

    const freshPlayerData = pl.find(p => p.id === cp.id);
    const isJudge = freshPlayerData?.is_judge ?? cp.is_judge;

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
        const data = payload.payload ?? {};
        if (!data.winnerName) return;
        // Just set the winner — the auto-dismiss timer lives in its own effect
        // (keyed on `roundWinner`) so it survives this channel being torn down
        // and rebuilt when the round advances. resolve_round broadcasts the
        // winner and advances game_state in the same transaction, so the round
        // change arrives almost immediately; arming the timer here would let
        // that teardown cancel it and leave the overlay stuck on screen.
        setRoundWinner({
          name: data.winnerName,
          playerId: data.winnerPlayerId ?? null,
          cardText: data.cardText ?? null,
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
      }, () => {
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
    roundWinner,
  };
};
