import { useEffect, useState, useRef } from "react";
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
  in_game: boolean;
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
  
  // Use ref to always have access to latest players list in callbacks
  const playersRef = useRef<Player[]>([]);

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
      playersRef.current = playersData;
      
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
    // Get current player ID from storage to avoid closure issues
    const getCurrentPlayerId = () => {
      let playerId = sessionStorage.getItem(`player_${roomId}`);
      if (!playerId) {
        playerId = localStorage.getItem(`player_${roomId}`);
      }
      return playerId;
    };

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
            console.log("Room UPDATE detected:", {
              old: payload.old,
              new: payload.new
            });
            setRoom(payload.new as Room);
          } else if (payload.eventType === "DELETE") {
            // Room was deleted, navigate to home
            toast({
              title: "ოთახი წაიშალა",
              description: "ყველა მოთამაშემ დატოვა ოთახი",
            });
            navigate("/");
          }
        }
      )
      .on(
        'broadcast',
        { event: 'return_to_lobby' },
        (payload: any) => {
          if (payload.payload) {
            setRoom((prevRoom) => prevRoom ? { ...prevRoom, status: "lobby" } : null);
            
            const playerName = payload.payload.playerName || "მოთამაშე";
            toast({
              title: "დაბრუნდით ოთახში",
              description: payload.payload.reason === 'judge_left'
                ? `${playerName} დაბრუნდა ლობიში - ყველა დაბრუნდა ლობიში`
                : `${playerName} დაბრუნდა ლობიში - არასაკმარისი მოთამაშე`,
            });
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
          console.log("Player change detected:", payload.eventType, payload);
          const currentPlayerId = getCurrentPlayerId();
          
          // Show toast when player leaves
          if (payload.eventType === "DELETE" && payload.old) {
            const leftPlayerId = (payload.old as { id: string }).id;
            
            // Find the player in current state before updating - use ref to get latest data
            const leftPlayer = playersRef.current.find(p => p.id === leftPlayerId);
            
            // Don't show toast if it's the current player leaving
            if (currentPlayerId && leftPlayerId !== currentPlayerId && leftPlayer) {
              toast({
                title: "მოთამაშე გავიდა",
                description: `${leftPlayer.name} დატოვა ოთახი`,
              });
            }
          }
          
          // Show toast when new player joins
          if (payload.eventType === "INSERT" && payload.new) {
            const newPlayer = payload.new as Player;
            console.log("Player joined:", newPlayer.name, newPlayer.id);
            console.log("Current player ID:", currentPlayerId);
            
            // Don't show toast if it's the current player joining
            if (currentPlayerId && newPlayer.id !== currentPlayerId) {
              toast({
                title: "ახალი მოთამაშე",
                description: `${newPlayer.name} შემოუერთდა ოთახს`,
              });
            }
          }
          
          // Reload players list
          const { data: playersData } = await supabase
            .from("players")
            .select("*")
            .eq("room_id", roomId)
            .order("joined_at", { ascending: true });

          if (playersData) {
            console.log("Updated players list:", playersData.length, "players");
            setPlayers(playersData);
            playersRef.current = playersData;
            
            // Update currentPlayer data if their info changed
            if (currentPlayerId) {
              const updatedCurrentPlayer = playersData.find(p => p.id === currentPlayerId);
              if (updatedCurrentPlayer) {
                console.log("Current player UPDATE detected:", {
                  before: currentPlayer,
                  after: updatedCurrentPlayer,
                  in_game_changed: currentPlayer?.in_game !== updatedCurrentPlayer.in_game
                });
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

  const handleReturnToLobby = async () => {
    if (!room || !currentPlayer) return;

    try {
      const isJudge = currentPlayer.is_judge;
      
      // Get current active players from database to ensure we have latest data
      const { data: activePlayers } = await supabase
        .from('players')
        .select('id, is_judge, in_game')
        .eq('room_id', room.id)
        .eq('in_game', true);
      
      // Count active comedians (non-judges that are in_game)
      const activeComedianCount = activePlayers?.filter(p => !p.is_judge).length || 0;
      
      // Calculate how many comedians will remain after this player returns to lobby
      const remainingComedians = isJudge ? activeComedianCount : activeComedianCount - 1;

      // If judge leaves OR if fewer than 2 comedians will remain, reset entire game
      if (isJudge || remainingComedians < 2) {
        // Delete game state
        await supabase
          .from("game_state")
          .delete()
          .eq("room_id", room.id);

        // Clear all submissions
        await supabase
          .from("submissions")
          .delete()
          .eq("room_id", room.id);

        // Clear all player hands
        await supabase
          .from("player_hands")
          .delete()
          .eq("room_id", room.id);

        // Reset all players' in_game status to false
        await supabase
          .from("players")
          .update({ in_game: false })
          .eq("room_id", room.id);

        // Reset room status to lobby
        await supabase
          .from("rooms")
          .update({ status: "lobby" })
          .eq("id", room.id);

        // Broadcast to all players to return to lobby using the same channel
        const channel = supabase.channel(`room_${room.id}`);
        await channel.subscribe();
        await channel.send({
          type: 'broadcast',
          event: 'return_to_lobby',
          payload: { 
            reason: isJudge ? 'judge_left' : 'insufficient_players',
            playerName: currentPlayer.name
          }
        });
        await supabase.removeChannel(channel);

        // Update local room state
        setRoom({ ...room, status: "lobby" });

        toast({
          title: "დაბრუნდით ოთახში",
          description: isJudge 
            ? "მსაჯული დაბრუნდა ლობიში - ყველა დაბრუნდა ლობიში" 
            : "არასაკმარისი მოთამაშე - ყველა დაბრუნდა ლობიში",
        });
      } else {
        // If 3+ comedians remain, mark this player as not in game
        await supabase
          .from("players")
          .update({ in_game: false })
          .eq("id", currentPlayer.id);

        // Remove this player's hands and submissions
        await supabase
          .from("player_hands")
          .delete()
          .eq("room_id", room.id)
          .eq("player_id", currentPlayer.id);

        await supabase
          .from("submissions")
          .delete()
          .eq("room_id", room.id)
          .eq("player_id", currentPlayer.id);

        // Update local room state to lobby for this player
        setRoom({ ...room, status: "lobby" });

        toast({
          title: "დაბრუნდით ოთახში",
          description: "წარმატებით დაბრუნდით ლობიში",
        });
      }
    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "ლობიში დაბრუნება ვერ მოხერხდა",
        variant: "destructive",
      });
    }
  };

  const handleLeaveGame = async () => {
    if (!currentPlayer || !room) return;

    try {
      // Check if the leaving player is the host and judge
      const isHost = currentPlayer.is_host;
      const isJudge = currentPlayer.is_judge;

      // Delete current player from the room
      await supabase
        .from("players")
        .delete()
        .eq("id", currentPlayer.id);

      // Check how many players are left in the room
      const { data: remainingPlayers } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", room.id);

      // If no players left, delete the room (CASCADE will clean up all related data)
      if (!remainingPlayers || remainingPlayers.length === 0) {
        await supabase
          .from("rooms")
          .delete()
          .eq("id", room.id);
      } else {
        // If game is playing, check if we need to return everyone to lobby
        if (room.status === "playing") {
          const remainingComedians = remainingPlayers.filter(p => !p.is_judge).length;
          
          // If judge left OR fewer than 2 comedians remain, end the game and return to lobby
          if (isJudge || remainingComedians < 2) {
            // Delete game state
            await supabase
              .from("game_state")
              .delete()
              .eq("room_id", room.id);

            // Clear all submissions
            await supabase
              .from("submissions")
              .delete()
              .eq("room_id", room.id);

            // Clear all player hands
            await supabase
              .from("player_hands")
              .delete()
              .eq("room_id", room.id);

            // Reset all players' in_game status to false
            await supabase
              .from("players")
              .update({ in_game: false })
              .eq("room_id", room.id);

            // Reset room status to lobby
            await supabase
              .from("rooms")
              .update({ status: "lobby" })
              .eq("id", room.id);

            // Broadcast to all remaining players to return to lobby
            const channel = supabase.channel(`room_${room.id}`);
            await channel.subscribe();
            await channel.send({
              type: 'broadcast',
              event: 'return_to_lobby',
              payload: { 
                reason: isJudge ? 'judge_left' : 'insufficient_players',
                playerName: currentPlayer.name
              }
            });
            await supabase.removeChannel(channel);
          }
        }
        
        // If the leaving player was the host, assign a new random host
        if (isHost && remainingPlayers.length > 0) {
          const newHost = remainingPlayers[Math.floor(Math.random() * remainingPlayers.length)];
          
          // Update the room with new host_id
          await supabase
            .from("rooms")
            .update({ host_id: newHost.id })
            .eq("id", room.id);

          // Update the new host player's is_host status
          await supabase
            .from("players")
            .update({ is_host: true })
            .eq("id", newHost.id);

          // Make sure all other players have is_host set to false
          await supabase
            .from("players")
            .update({ is_host: false })
            .eq("room_id", room.id)
            .neq("id", newHost.id);
        }
      }

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

    // Check if there is at least one judge
    const hasJudge = players.some(p => p.is_judge);
    if (!hasJudge) {
      toast({
        title: "მსაჯული აკლია",
        description: "თამაშის დასაწყებად აუცილებელია მსაჯული",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log("Starting game...");
      console.log("Current players:", players);
      console.log("Current player:", currentPlayer);
      
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

      // IMPORTANT: Reset all players' scores to 0 and set in_game to true BEFORE changing room status
      console.log("Updating all players in_game status to true...");
      const { error: playersUpdateError, data: updatedPlayersData } = await supabase
        .from("players")
        .update({ score: 0, in_game: true })
        .eq("room_id", room.id)
        .select();
        
      if (playersUpdateError) {
        console.error("Error updating players:", playersUpdateError);
        throw playersUpdateError;
      }
      
      console.log("Players update result:", updatedPlayersData);
      
      // Verify all players are updated
      const { data: updatedPlayers } = await supabase
        .from("players")
        .select("id, name, in_game, is_judge")
        .eq("room_id", room.id);
        
      console.log("Players after update:", updatedPlayers);
      
      // Update local currentPlayer state immediately
      const updatedCurrentPlayer = updatedPlayers?.find(p => p.id === currentPlayer.id);
      if (updatedCurrentPlayer) {
        console.log("Updating local currentPlayer:", updatedCurrentPlayer);
        setCurrentPlayer({ ...currentPlayer, in_game: true, score: 0 });
      }
      
      // Longer delay to ensure ALL players receive and process the realtime updates
      console.log("Waiting for all players to sync...");
      await new Promise(resolve => setTimeout(resolve, 1000));

      // NOW update room status after all players are confirmed in_game
      console.log("Updating room status to playing...");
      const { error: roomUpdateError, data: updatedRoomData } = await supabase
        .from("rooms")
        .update({ status: "playing" })
        .eq("id", room.id)
        .select()
        .single();
        
      if (roomUpdateError) {
        console.error("Error updating room:", roomUpdateError);
        throw roomUpdateError;
      }
      
      console.log("Room status updated:", updatedRoomData);
      
      // Update local room state immediately
      if (updatedRoomData) {
        console.log("Setting local room state to playing");
        setRoom(updatedRoomData as Room);
      }

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
          
          // Prepare all card assignments in a single batch
          const allCardInserts = [];
          
          for (const player of nonJudgePlayers) {
            // Give each player exactly 6 unique cards
            const playerCards = shuffledCards.slice(cardIndex, cardIndex + 6);
            cardIndex += 6;

            console.log(`Preparing ${playerCards.length} cards for player ${player.name}`);
            
            // Add all 6 cards for this player to the batch
            for (const card of playerCards) {
              allCardInserts.push({
                player_id: player.id,
                card_id: card.id,
                room_id: room.id,
              });
            }
          }
          
          // Insert all cards at once
          console.log(`Inserting ${allCardInserts.length} cards total`);
          const { error: handError } = await supabase
            .from("player_hands")
            .insert(allCardInserts);
          
          if (handError) {
            console.error("Failed to deal cards:", handError);
            toast({
              title: "შეცდომა",
              description: "ბარათების დარიგება ვერ მოხერხდა",
              variant: "destructive",
            });
            return;
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

  // Determine whether to show lobby or game board based on room status AND player's in_game status
  const shouldShowLobby = room.status === "lobby" || !currentPlayer.in_game;
  
  console.log("Render decision:", {
    roomStatus: room.status,
    playerInGame: currentPlayer.in_game,
    shouldShowLobby,
    playerName: currentPlayer.name,
    isJudge: currentPlayer.is_judge
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10">
      {shouldShowLobby ? (
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
          onReturnToLobby={handleReturnToLobby}
        />
      )}
    </div>
  );
};

export default Game;
