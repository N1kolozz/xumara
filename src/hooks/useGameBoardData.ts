import { useState, useEffect } from "react";
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

  const loadGameData = async () => {
    if (!gameState) return;

    const freshPlayerData = players.find(p => p.id === currentPlayer.id);
    const isJudge = freshPlayerData?.is_judge ?? currentPlayer.is_judge;

    if (gameState.current_inbox_card_id) {
      const { data: inboxData } = await supabase
        .from("cards")
        .select("*")
        .eq("id", gameState.current_inbox_card_id)
        .single();
      if (inboxData) setInboxCard(inboxData as CardData);
    }

    if (!isJudge && gameState.phase === "submitting") {
      const { data: handData } = await supabase
        .from("player_hands")
        .select("card_id, cards(*)")
        .eq("player_id", currentPlayer.id)
        .eq("room_id", room.id);

      if (handData) {
        const cards = handData.map((h) => h.cards).filter(Boolean) as CardData[];
        setPlayerCards(cards);
      }
    }

    const { data: submissionsData } = await supabase
      .from("submissions")
      .select("*, cards(*), players(name)")
      .eq("room_id", room.id)
      .eq("round_number", gameState.round_number);

    if (submissionsData) {
      setSubmissions(submissionsData as unknown as Submission[]);
    }
  };

  useEffect(() => {
    if (!gameState) return;
    loadGameData();

    const submissionsChannel = supabase.channel(`submissions_${room.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "submissions",
        filter: `room_id=eq.${room.id}`
      }, async () => {
        if (!gameState) return;
        const { data: submissionsData } = await supabase
          .from("submissions")
          .select("*, cards(*), players(name)")
          .eq("room_id", room.id)
          .eq("round_number", gameState.round_number);
        
        if (submissionsData) {
          setSubmissions(submissionsData as unknown as Submission[]);
        }
      })
      .on("broadcast", { event: "round_winner" }, (payload) => {
        toast({
          title: "გამარჯვებული შეირჩა!",
          description: `${payload.payload.winnerName} მოიგო ეს რაუნდი!`
        });
      })
      .subscribe();

    const gameStateChannel = supabase.channel(`game_state_${room.id}`).on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "game_state",
      filter: `room_id=eq.${room.id}`
    }, (payload) => {
      if (payload.eventType === "UPDATE" && payload.new.winner_name && payload.new.winner_score !== null) {
        const isDraw = payload.new.winner_name.includes(",");
        if (isDraw) {
          toast({
            title: "თამაში დასრულდა!",
            description: `${payload.new.winner_name} მოთამაშეებს შორის დამთავრდა ფრე ${payload.new.winner_score} ქულით!`
          });
        } else {
          toast({
            title: "თამაში დასრულდა!",
            description: `${payload.new.winner_name} არის გამარჯვებული ${payload.new.winner_score} ქულით!`
          });
        }
      }
      loadGameData();
    }).subscribe();

    return () => {
      supabase.removeChannel(submissionsChannel);
      supabase.removeChannel(gameStateChannel);
    };
  }, [gameState?.round_number, gameState?.phase, currentPlayer.id, players]);

  return {
    inboxCard,
    playerCards,
    setPlayerCards,
    submissions,
  };
};
