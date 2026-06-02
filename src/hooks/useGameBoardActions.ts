import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Room, Player, GameState, CardData, Submission } from "@/types/game";
import { BLANK_CARD_ID, JUDGE_MS, SUBMIT_MS, revealDurationMs } from "@/lib/gameConfig";
import React from "react";

interface UseGameBoardActionsProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  gameState: GameState | null;
  submissions: Submission[];
  setPlayerCards: React.Dispatch<React.SetStateAction<CardData[]>>;
  setSelectedCard: React.Dispatch<React.SetStateAction<string | null>>;
}

export const useGameBoardActions = ({
  room,
  players,
  currentPlayer,
  gameState,
  submissions,
  setPlayerCards,
  setSelectedCard,
}: UseGameBoardActionsProps) => {
  const { toast } = useToast();
  const [isSubmittingCard, setIsSubmittingCard] = useState(false);
  const [isSelectingWinner, setIsSelectingWinner] = useState(false);

  // Move the round from submitting -> revealing. Guarded so concurrent callers
  // (last submitter and the auto-resolve timer) only transition once.
  const transitionToRevealing = async (subCount: number) => {
    if (!gameState) return;
    await supabase
      .from("game_state")
      .update({
        phase: "revealing",
        phase_deadline: new Date(Date.now() + revealDurationMs(subCount)).toISOString(),
      })
      .eq("room_id", room.id)
      .eq("phase", "submitting")
      .eq("round_number", gameState.round_number);
  };

  const handleSubmitCard = async (cardId: string | null, customText?: string) => {
    if (!cardId || !gameState || isSubmittingCard) return;
    const isBlank = cardId === BLANK_CARD_ID;
    if (isBlank && !customText?.trim()) return;
    setIsSubmittingCard(true);

    try {
      await supabase.from("submissions").insert({
        room_id: room.id,
        player_id: currentPlayer.id,
        card_id: cardId,
        round_number: gameState.round_number,
        custom_text: isBlank ? customText!.trim() : null,
      });

      // The blank is a permanent UI card — never remove it from the hand.
      if (!isBlank) {
        await supabase.rpc("remove_card_from_hand", { p_player_id: currentPlayer.id, p_card_id: cardId });
        setPlayerCards((cards) => cards.filter((card) => card.id !== cardId));
      }

      setSelectedCard(null);

      const nonJudgePlayers = players.filter(p => !p.is_judge && p.in_game);
      const { data: currentSubmissions } = await supabase
        .from("submissions")
        .select("*")
        .eq("room_id", room.id)
        .eq("round_number", gameState.round_number);

      if (currentSubmissions && currentSubmissions.length >= nonJudgePlayers.length) {
        await transitionToRevealing(currentSubmissions.length);
      }
    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "ბარათის გაგზავნა ვერ მოხერხდა",
        variant: "destructive"
      });
    } finally {
      setIsSubmittingCard(false);
    }
  };

  const handleSelectWinner = async (cardId: string) => {
    const currentPlayerData = players.find(p => p.id === currentPlayer.id);
    if (!currentPlayerData?.is_judge || !gameState || isSelectingWinner) return;

    const winningSubmission = submissions.find(s => s.card_id === cardId);
    if (!winningSubmission) return;

    setIsSelectingWinner(true);
    try {
      await supabase.from("submissions").update({ is_winner: true }).eq("id", winningSubmission.id);

      const winner = players.find(p => p.id === winningSubmission.player_id);
      if (winner) {
        await supabase.from("players").update({ score: winner.score + 1 }).eq("id", winner.id);
        const channel = supabase.channel(`submissions_${room.id}`);
        await channel.send({
          type: "broadcast",
          event: "round_winner",
          payload: { winnerName: winner.name }
        });
      }

      await supabase.from("submissions").delete().eq("room_id", room.id).eq("round_number", gameState.round_number);

      if (gameState.round_number >= gameState.max_rounds) {
        // Final round: record the winner and park the room in `finished` so the
        // results overlay shows. The host then chooses Rematch or back-to-lobby.
        const { data: updatedPlayers } = await supabase.from("players").select("*").eq("room_id", room.id);
        if (updatedPlayers) {
          const sortedPlayers = [...updatedPlayers].sort((a, b) => b.score - a.score);
          const topScore = sortedPlayers[0]?.score || 0;
          const winners = sortedPlayers.filter(p => p.score === topScore);
          const winnerName = winners.length > 1
            ? winners.map(w => w.name).join(", ")
            : sortedPlayers[0]?.name;

          await supabase.from("game_state").update({
            winner_name: winnerName,
            winner_score: topScore,
            phase_deadline: null,
          }).eq("room_id", room.id);

          await supabase.from("rooms").update({ status: "finished" }).eq("id", room.id);
        }
      } else {
        let inboxQuery = supabase.from("cards").select("*").eq("type", "inbox");
        if (gameState.pack) inboxQuery = inboxQuery.eq("category", gameState.pack);
        const { data: inboxCards } = await inboxQuery;

        if (inboxCards && inboxCards.length > 0) {
          const randomInbox = inboxCards[Math.floor(Math.random() * inboxCards.length)];

          await supabase.rpc("deal_one_card", { p_room_id: room.id });

          await supabase.from("game_state").update({
            phase: "submitting",
            current_inbox_card_id: randomInbox.id,
            round_number: gameState.round_number + 1,
            phase_deadline: new Date(Date.now() + SUBMIT_MS).toISOString(),
          }).eq("room_id", room.id);
        }
      }
    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "გამარჯვებულის შერჩევა ვერ მოხერხდა",
        variant: "destructive"
      });
    } finally {
      setIsSelectingWinner(false);
    }
  };

  // ── Auto-resolve on timer expiry (driven by the judge's client) ───────────

  // Submit phase ran out: auto-play a random hand card for anyone who didn't
  // choose, then advance to revealing.
  const autoResolveSubmit = async () => {
    if (!gameState) return;
    const { data: gs } = await supabase
      .from("game_state")
      .select("phase, round_number")
      .eq("room_id", room.id)
      .maybeSingle();
    if (!gs || gs.phase !== "submitting") return;

    const nonJudge = players.filter(p => !p.is_judge && p.in_game);
    const { data: subs } = await supabase
      .from("submissions")
      .select("player_id")
      .eq("room_id", room.id)
      .eq("round_number", gameState.round_number);
    const submitted = new Set((subs ?? []).map(s => s.player_id));
    const missing = nonJudge.filter(p => !submitted.has(p.id));

    for (const p of missing) {
      const { data: pd } = await supabase.from("players").select("hand").eq("id", p.id).single();
      const hand = (pd?.hand ?? []) as string[];
      if (hand.length === 0) continue;
      const card = hand[Math.floor(Math.random() * hand.length)];
      await supabase.from("submissions").insert({
        room_id: room.id,
        player_id: p.id,
        card_id: card,
        round_number: gameState.round_number,
      });
      await supabase.rpc("remove_card_from_hand", { p_player_id: p.id, p_card_id: card });
    }

    const { count } = await supabase
      .from("submissions")
      .select("*", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("round_number", gameState.round_number);
    await transitionToRevealing(count ?? nonJudge.length);
  };

  // Reveal animation finished: open judging.
  const advanceRevealToJudging = async () => {
    if (!gameState) return;
    await supabase
      .from("game_state")
      .update({
        phase: "judging",
        phase_deadline: new Date(Date.now() + JUDGE_MS).toISOString(),
      })
      .eq("room_id", room.id)
      .eq("phase", "revealing")
      .eq("round_number", gameState.round_number);
  };

  // Judging ran out: auto-pick a random submission as the winner.
  const autoResolveJudge = async () => {
    if (!gameState) return;
    const { data: gs } = await supabase
      .from("game_state")
      .select("phase")
      .eq("room_id", room.id)
      .maybeSingle();
    if (!gs || gs.phase !== "judging") return;

    const { data: subs } = await supabase
      .from("submissions")
      .select("card_id")
      .eq("room_id", room.id)
      .eq("round_number", gameState.round_number);
    if (!subs || subs.length === 0) return;
    const pick = subs[Math.floor(Math.random() * subs.length)];
    await handleSelectWinner(pick.card_id);
  };

  // Only the judge's client schedules expiry transitions. Every transition is
  // guarded by a conditional update, so a late double-fire is a no-op.
  useEffect(() => {
    if (!gameState?.phase_deadline || gameState.winner_name) return;
    const me = players.find(p => p.id === currentPlayer.id);
    if (!me?.is_judge) return;

    const phase = gameState.phase;
    if (phase !== "submitting" && phase !== "revealing" && phase !== "judging") return;

    const delay = Math.max(0, new Date(gameState.phase_deadline).getTime() - Date.now()) + 400;
    const timer = window.setTimeout(() => {
      if (phase === "submitting") void autoResolveSubmit();
      else if (phase === "revealing") void advanceRevealToJudging();
      else if (phase === "judging") void autoResolveJudge();
    }, delay);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.phase, gameState?.phase_deadline, gameState?.round_number, gameState?.winner_name, currentPlayer.id]);

  return {
    handleSubmitCard,
    handleSelectWinner,
    isSelectingWinner,
    isSubmittingCard,
  };
};
