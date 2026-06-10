import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Room, Player, GameState, CardData } from "@/types/game";
import { BLANK_CARD_ID, revealDurationMs } from "@/lib/gameConfig";
import React from "react";

interface UseGameBoardActionsProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  gameState: GameState | null;
  setPlayerCards: React.Dispatch<React.SetStateAction<CardData[]>>;
  setSelectedCard: React.Dispatch<React.SetStateAction<string | null>>;
}

export const useGameBoardActions = ({
  room,
  players,
  currentPlayer,
  gameState,
  setPlayerCards,
  setSelectedCard,
}: UseGameBoardActionsProps) => {
  const { toast } = useToast();
  const [isSubmittingCard, setIsSubmittingCard] = useState(false);
  const [isSelectingWinner, setIsSelectingWinner] = useState(false);

  // Move the round from submitting -> revealing as soon as the last player
  // submits (no need to wait for the deadline). Guarded so concurrent callers
  // only transition once.
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
      const { error: insertError } = await supabase.from("submissions").insert({
        room_id: room.id,
        player_id: currentPlayer.id,
        card_id: cardId,
        round_number: gameState.round_number,
        custom_text: isBlank ? customText!.trim() : null,
      });

      if (insertError) {
        // 23505 = unique violation: this player already has a submission for
        // this round (double-tap or auto-resolve raced us) — keep the hand intact.
        if (insertError.code === "23505") return;
        throw insertError;
      }

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

  // Round resolution (winner marking, scoring, next round / game finish) runs
  // atomically in the resolve_round RPC — one transaction, so a judge tap and
  // the expiry auto-pick can never both score. Winner is identified by
  // submission id: blank-card submissions all share one card_id, so card_id
  // can't tell two blanks apart.
  const handleSelectWinner = async (submissionId: string) => {
    const currentPlayerData = players.find(p => p.id === currentPlayer.id);
    if (!currentPlayerData?.is_judge || !gameState || isSelectingWinner) return;

    setIsSelectingWinner(true);
    try {
      const { error } = await supabase.rpc("resolve_round", {
        p_room_id: room.id,
        p_submission_id: submissionId,
      });
      if (error) throw error;
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

  // Expired phases are resolved server-side by the pg_cron watchdog (see the
  // server_phase_watchdog migration), so the game advances even when every
  // phone is locked. This fallback fires from EVERY client shortly after the
  // deadline so expiry feels instant and the game still moves if the watchdog
  // isn't running. resolve_room_phase is safe under concurrency: it no-ops
  // unless the deadline truly passed, and a row lock serializes callers.
  useEffect(() => {
    if (!gameState?.phase_deadline || gameState.winner_name) return;

    const phase = gameState.phase;
    if (phase !== "submitting" && phase !== "revealing" && phase !== "judging") return;

    const delay = Math.max(0, new Date(gameState.phase_deadline).getTime() - Date.now())
      + 1000 + Math.random() * 1500;
    const timer = window.setTimeout(() => {
      void supabase.rpc("resolve_room_phase", { p_room_id: room.id });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [gameState?.phase, gameState?.phase_deadline, gameState?.round_number, gameState?.winner_name, room.id]);

  return {
    handleSubmitCard,
    handleSelectWinner,
    isSelectingWinner,
    isSubmittingCard,
  };
};
