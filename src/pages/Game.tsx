import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import GameLobby from "@/components/game/GameLobby";
import GameBoard from "@/components/game/GameBoard";

interface Room {
  id: string;
  pin: string;
  status: string;
}

interface Player {
  id: string;
  name: string;
  score: number;
  is_judge: boolean;
  is_host: boolean;
}

interface GameState {
  phase: string;
  current_judge_id: string | null;
  current_inbox_card_id: string | null;
  round_number: number;
  max_rounds: number;
}

const Game = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!roomId) {
      navigate("/");
      return;
    }

    loadRoomData();
    subscribeToRealtime();
  }, [roomId]);

  const loadRoomData = async () => {
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

    setRoom(roomData);

    const { data: playersData } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });

    if (playersData) {
      setPlayers(playersData);
      
      // Try sessionStorage first (tab-specific), fallback to localStorage
      let playerId = sessionStorage.getItem(`player_${roomId}`);
      if (!playerId) {
        playerId = localStorage.getItem(`player_${roomId}`);
        // If found in localStorage, copy to sessionStorage for this tab
        if (playerId) {
          sessionStorage.setItem(`player_${roomId}`, playerId);
        }
      }
      
      console.log("Current player ID from storage:", playerId);
      if (playerId) {
        const player = playersData.find(p => p.id === playerId);
        console.log("Found current player:", player);
        if (player) {
          setCurrentPlayer(player);
          console.log("Is host:", player.is_host);
        }
      }
    }

    if (roomData.status === "playing") {
      const { data: gameStateData } = await supabase
        .from("game_state")
        .select("*")
        .eq("room_id", roomId)
        .single();

      if (gameStateData) {
        setGameState(gameStateData);
      }
    }
  };

  const subscribeToRealtime = () => {
    const channel = supabase
      .channel(`room_${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setRoom(payload.new as Room);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          console.log("Player change detected:", payload.eventType);
          
          // Just reload players list, don't change currentPlayer
          const { data: playersData } = await supabase
            .from("players")
            .select("*")
            .eq("room_id", roomId)
            .order("joined_at", { ascending: true });

          if (playersData) {
            setPlayers(playersData);
            
            // Update currentPlayer data if their info changed
            if (currentPlayer) {
              const updatedCurrentPlayer = playersData.find(p => p.id === currentPlayer.id);
              if (updatedCurrentPlayer) {
                setCurrentPlayer(updatedCurrentPlayer);
                console.log("Updated current player:", updatedCurrentPlayer);
              }
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_state",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.new) {
            setGameState(payload.new as GameState);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleLeaveGame = async () => {
    if (!currentPlayer || !room) return;

    try {
      // Delete current player from the room
      await supabase
        .from("players")
        .delete()
        .eq("id", currentPlayer.id);

      // Clear storage
      sessionStorage.removeItem(`player_${room.id}`);
      localStorage.removeItem(`player_${room.id}`);

      toast({
        title: "გასული ხართ თამაშიდან",
        description: "წარმატებით დატოვეთ ოთახი",
      });

      navigate("/");
    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "ოთახიდან გასვლა ვერ მოხერხდა",
        variant: "destructive",
      });
    }
  };

  const handleStartGame = async (maxRounds: number) => {
    if (!currentPlayer?.is_host || !room) return;

    if (players.length < 3) {
      toast({
        title: "არასაკმარისი ხუმარები",
        description: "თამაშის დასაწყებად მინიმუმ 3 ხუმარა არის საჭირო",
        variant: "destructive",
      });
      return;
    }

    try {
      // Check if game already started
      const { data: existingGameState } = await supabase
        .from("game_state")
        .select("*")
        .eq("room_id", room.id)
        .maybeSingle();

      if (existingGameState) {
        toast({
          title: "თამაში უკვე დაწყებულია",
          description: "თამაში უკვე მიმდინარეობს",
          variant: "destructive",
        });
        return;
      }

      // Clean up previous game data
      await supabase
        .from("submissions")
        .delete()
        .eq("room_id", room.id);

      await supabase
        .from("player_hands")
        .delete()
        .eq("room_id", room.id);

      // Reset all players' scores to 0 (keep is_judge status unchanged)
      await supabase
        .from("players")
        .update({ score: 0 })
        .eq("room_id", room.id);

      // Update room status
      await supabase
        .from("rooms")
        .update({ status: "playing" })
        .eq("id", room.id);

      // Get random inbox card
      const { data: inboxCards } = await supabase
        .from("cards")
        .select("*")
        .eq("type", "inbox");

      if (inboxCards && inboxCards.length > 0) {
        const randomInbox = inboxCards[Math.floor(Math.random() * inboxCards.length)];

        // Find the current judge (player with is_judge=true)
        const judgePlayer = players.find(p => p.is_judge) || players[0];

        // Create game state with the current judge and max rounds
        const { error: gameStateError } = await supabase.from("game_state").insert({
          room_id: room.id,
          current_judge_id: judgePlayer.id,
          current_inbox_card_id: randomInbox.id,
          round_number: 1,
          phase: "submitting",
          max_rounds: maxRounds,
        });

        if (gameStateError) {
          console.error("Game state error:", gameStateError);
          throw gameStateError;
        }

        // Deal cards to all players except judges
        const { data: replyCards } = await supabase
          .from("cards")
          .select("*")
          .eq("type", "reply");

        if (replyCards && replyCards.length >= 6 * players.filter(p => !p.is_judge).length) {
          // Filter out judge players - only regular players get cards
          const nonJudgePlayers = players.filter(p => !p.is_judge);
          
          console.log(`Dealing cards to ${nonJudgePlayers.length} non-judge players`);
          console.log(`Available reply cards: ${replyCards.length}`);
          
          // Shuffle all reply cards once
          const shuffledCards = [...replyCards].sort(() => Math.random() - 0.5);
          let cardIndex = 0;
          
          for (const player of nonJudgePlayers) {
            // Give each player exactly 6 unique cards
            const playerCards = shuffledCards.slice(cardIndex, cardIndex + 6);
            cardIndex += 6;

            console.log(`Dealing ${playerCards.length} cards to player ${player.name}`);
            
            for (const card of playerCards) {
              const { error: handError } = await supabase.from("player_hands").insert({
                player_id: player.id,
                card_id: card.id,
                room_id: room.id,
              });
              
              if (handError) {
                console.error("Hand insert error:", handError);
              }
            }
          }
        } else {
          toast({
            title: "არასაკმარისი ბარათები",
            description: "ბაზაში არ არის საკმარისი ბარათები თამაშისთვის",
            variant: "destructive",
          });
          return;
        }
      }

      toast({
        title: "თამაში დაიწყო!",
        description: "გისურვებთ წარმატებას!",
      });
    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "თამაშის დაწყება ვერ მოხერხდა",
        variant: "destructive",
      });
    }
  };

  if (!room || !currentPlayer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">იტვირთება...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10">
      {room.status === "lobby" ? (
        <GameLobby
          room={room}
          players={players}
          currentPlayer={currentPlayer}
          onStartGame={handleStartGame}
          onLeaveGame={handleLeaveGame}
        />
      ) : (
        <GameBoard
          room={room}
          players={players}
          currentPlayer={currentPlayer}
          gameState={gameState}
          onLeaveGame={handleLeaveGame}
        />
      )}
    </div>
  );
};

export default Game;
