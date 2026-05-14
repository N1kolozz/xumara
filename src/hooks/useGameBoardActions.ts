import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Room, Player, GameState, CardData, Submission } from "@/types/game";
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

  const handleSubmitCard = async (cardId: string | null) => {
    if (!cardId || !gameState || isSubmittingCard) return;
    setIsSubmittingCard(true);

    try {
      await supabase.from("submissions").insert({
        room_id: room.id,
        player_id: currentPlayer.id,
        card_id: cardId,
        round_number: gameState.round_number
      });

      await supabase.rpc("remove_card_from_hand", { p_player_id: currentPlayer.id, p_card_id: cardId });

      setSelectedCard(null);
      setPlayerCards((cards) => cards.filter((card) => card.id !== cardId));

      const nonJudgePlayers = players.filter(p => !p.is_judge && p.in_game);
      const { data: currentSubmissions } = await supabase
        .from("submissions")
        .select("*")
        .eq("room_id", room.id)
        .eq("round_number", gameState.round_number);

      if (currentSubmissions && currentSubmissions.length === nonJudgePlayers.length) {
        await supabase.from("game_state").update({
          phase: "judging"
        }).eq("room_id", room.id);
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
    if (!currentPlayerData?.is_judge || !gameState) return;

    const winningSubmission = submissions.find(s => s.card_id === cardId);
    if (!winningSubmission) return;

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
        const { data: updatedPlayers } = await supabase.from("players").select("*").eq("room_id", room.id);
        if (updatedPlayers) {
          const sortedPlayers = [...updatedPlayers].sort((a, b) => b.score - a.score);
          const topScore = sortedPlayers[0]?.score || 0;
          const winners = sortedPlayers.filter(p => p.score === topScore);
          
          if (winners.length > 1) {
            const winnerNames = winners.map(w => w.name).join(", ");
            await supabase.from("game_state").update({
              winner_name: winnerNames,
              winner_score: topScore
            }).eq("room_id", room.id);
          } else {
            const gameWinner = sortedPlayers[0];
            await supabase.from("game_state").update({
              winner_name: gameWinner?.name,
              winner_score: topScore
            }).eq("room_id", room.id);
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
          await supabase.from("players").update({ score: 0, in_game: false }).eq("room_id", room.id);
          await supabase.from("submissions").delete().eq("room_id", room.id);
          await supabase.from("game_state").delete().eq("room_id", room.id);
          await supabase.rpc("clear_room_hands", { p_room_id: room.id });
          await supabase.from("rooms").update({ status: "lobby" }).eq("id", room.id);
        }
      } else {
        const { data: inboxCards } = await supabase.from("cards").select("*").eq("type", "inbox");
        if (inboxCards && inboxCards.length > 0) {
          const randomInbox = inboxCards[Math.floor(Math.random() * inboxCards.length)];

          await supabase.rpc("deal_one_card", { p_room_id: room.id });

          await supabase.from("game_state").update({
            phase: "submitting",
            current_inbox_card_id: randomInbox.id,
            round_number: gameState.round_number + 1
          }).eq("room_id", room.id);
        }
      }
    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "გამარჯვებულის შერჩევა ვერ მოხერხდა",
        variant: "destructive"
      });
    }
  };

  return {
    handleSubmitCard,
    handleSelectWinner,
  };
};
