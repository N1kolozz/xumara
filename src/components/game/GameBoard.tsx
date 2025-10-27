import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import GameCard from "./GameCard";
import Scoreboard from "./Scoreboard";
import useEmblaCarousel from "embla-carousel-react";
interface Player {
  id: string;
  name: string;
  score: number;
  is_judge: boolean;
  in_game: boolean;
}
interface GameState {
  phase: string;
  current_judge_id: string | null;
  current_inbox_card_id: string | null;
  round_number: number;
  max_rounds: number;
}
interface GameBoardProps {
  room: {
    id: string;
  };
  players: Player[];
  currentPlayer: Player;
  gameState: GameState | null;
  onReturnToLobby: () => void;
}
interface CardData {
  id: string;
  text_ge: string;
  type: string;
}
interface Submission {
  id: string;
  player_id: string;
  card_id: string;
}
const GameBoard = ({
  room,
  players,
  currentPlayer,
  gameState,
  onReturnToLobby
}: GameBoardProps) => {
  const {
    toast
  } = useToast();
  const [inboxCard, setInboxCard] = useState<CardData | null>(null);
  const [playerCards, setPlayerCards] = useState<CardData[]>([]);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submittedCards, setSubmittedCards] = useState<CardData[]>([]);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "center"
  });
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  useEffect(() => {
    if (!gameState) return;
    console.log("GameBoard useEffect triggered:", {
      round: gameState.round_number,
      phase: gameState.phase,
      playerId: currentPlayer.id,
      playerName: currentPlayer.name
    });
    loadGameData();
    const unsubscribe = subscribeToSubmissions();
    return unsubscribe;
  }, [gameState?.round_number, gameState?.phase, currentPlayer.id, players]);
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      setCurrentCardIndex(emblaApi.selectedScrollSnap());
    };
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);
  const loadGameData = async () => {
    if (!gameState) return;

    // Get fresh player data from players array
    const freshPlayerData = players.find(p => p.id === currentPlayer.id);
    const isJudge = freshPlayerData?.is_judge ?? currentPlayer.is_judge;

    console.log("Loading game data:", {
      currentPlayerId: currentPlayer.id,
      isJudge,
      phase: gameState.phase,
      roomId: room.id,
      usedFreshData: !!freshPlayerData
    });

    // Load inbox card
    if (gameState.current_inbox_card_id) {
      const {
        data: inboxData
      } = await supabase.from("cards").select("*").eq("id", gameState.current_inbox_card_id).single();
      if (inboxData) setInboxCard(inboxData);
    }

    // Load player's hand (only if not judge)
    if (!isJudge && gameState.phase === "submitting") {
      console.log("Loading player cards for non-judge player...");
      
      // Load existing cards from database
      const {
        data: handData,
        error: handError
      } = await supabase.from("player_hands").select("card_id, cards(*)").eq("player_id", currentPlayer.id).eq("room_id", room.id);
      
      console.log("Player hands query result:", {
        handData,
        handError,
        count: handData?.length || 0
      });
      
      if (handData) {
        const cards = handData.map((h: any) => h.cards).filter(Boolean);
        console.log("Setting player cards:", cards.length);
        setPlayerCards(cards);
      }
    } else {
      console.log("Skipping card load:", {
        reason: isJudge ? "Player is judge" : `Phase is ${gameState.phase}`
      });
    }

    // Load submissions for all phases (so players can see cards on table)
    console.log("Loading submissions for round:", gameState.round_number);
    const {
      data: submissionsData
    } = await supabase.from("submissions").select("*, cards(*), players(name)").eq("room_id", room.id).eq("round_number", gameState.round_number);
    
    console.log("Loaded submissions:", {
      count: submissionsData?.length || 0,
      submissions: submissionsData
    });
    
    if (submissionsData) {
      setSubmissions(submissionsData);
      const cards = submissionsData.map((s: any) => s.cards).filter(Boolean);
      setSubmittedCards(cards);
      console.log("Set submitted cards:", cards.length);
    }
  };
  const subscribeToSubmissions = () => {
    const submissionsChannel = supabase.channel(`submissions_${room.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "submissions",
        filter: `room_id=eq.${room.id}`
      }, async () => {
        // Reload submissions in real-time so all players see cards on table
        if (!gameState) return;
        console.log("Submissions change detected, reloading...");
        const {
          data: submissionsData
        } = await supabase.from("submissions").select("*, cards(*), players(name)").eq("room_id", room.id).eq("round_number", gameState.round_number);
        
        console.log("Realtime submissions loaded:", {
          count: submissionsData?.length || 0
        });
        
        if (submissionsData) {
          setSubmissions(submissionsData);
          const cards = submissionsData.map((s: any) => s.cards).filter(Boolean);
          setSubmittedCards(cards);
        }
      })
      .on("broadcast", { event: "round_winner" }, (payload) => {
        // Show toast when judge selects a winner
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
      console.log("Game state changed, reloading data");
      
      // Check if game winner was announced (for all players to see)
      if (payload.eventType === "UPDATE" && payload.new.winner_name && payload.new.winner_score !== null) {
        // Check if it's a draw (winner_name contains comma, meaning multiple winners)
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
  };
  const handleSubmitCard = async () => {
    if (!selectedCard || !gameState) return;
    try {
      // Submit the card
      await supabase.from("submissions").insert({
        room_id: room.id,
        player_id: currentPlayer.id,
        card_id: selectedCard,
        round_number: gameState.round_number
      });

      // Remove the card from player's hand
      await supabase.from("player_hands").delete().eq("player_id", currentPlayer.id).eq("card_id", selectedCard).eq("room_id", room.id);
      toast({
        title: "ბარათი გაგზავნილია!"
      });
      setSelectedCard(null);

      // Check if all non-judge players have submitted
      const nonJudgePlayers = players.filter(p => !p.is_judge && p.in_game);
      const {
        data: currentSubmissions
      } = await supabase.from("submissions").select("*").eq("room_id", room.id).eq("round_number", gameState.round_number);
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
    }
  };
  const handleSelectWinner = async (cardId: string) => {
    // Get fresh judge status from players array to avoid stale state
    const currentPlayerData = players.find(p => p.id === currentPlayer.id);
    if (!currentPlayerData?.is_judge || !gameState) {
      console.log("Cannot select winner:", { 
        isJudge: currentPlayerData?.is_judge, 
        hasGameState: !!gameState,
        currentPlayerId: currentPlayer.id 
      });
      return;
    }
    const winningSubmission = submissions.find(s => s.card_id === cardId);
    if (!winningSubmission) return;
    try {
      // Mark winner
      await supabase.from("submissions").update({
        is_winner: true
      }).eq("id", winningSubmission.id);

      // Update winner's score
      const winner = players.find(p => p.id === winningSubmission.player_id);
      if (winner) {
        await supabase.from("players").update({
          score: winner.score + 1
        }).eq("id", winner.id);
        
        // Broadcast winner to all players in the room
        const channel = supabase.channel(`submissions_${room.id}`);
        await channel.send({
          type: "broadcast",
          event: "round_winner",
          payload: { winnerName: winner.name }
        });
      }

      // Clear submissions for next round
      await supabase.from("submissions").delete().eq("room_id", room.id).eq("round_number", gameState.round_number);

      // Clear all players' hands so they get new cards in next round
      await supabase.from("player_hands").delete().eq("room_id", room.id);

      // Check if this was the last round
      if (gameState.round_number >= gameState.max_rounds) {
        // Game is over, find the winner
        // Get updated scores from database after winner's score was incremented
        const {
          data: updatedPlayers
        } = await supabase.from("players").select("*").eq("room_id", room.id);
        if (updatedPlayers) {
          const sortedPlayers = [...updatedPlayers].sort((a, b) => b.score - a.score);
          const topScore = sortedPlayers[0]?.score || 0;
          
          // Check for draw - find all players with top score
          const winners = sortedPlayers.filter(p => p.score === topScore);
          
          if (winners.length > 1) {
            // It's a draw
            const winnerNames = winners.map(w => w.name).join(", ");
            await supabase.from("game_state").update({
              winner_name: winnerNames,
              winner_score: topScore
            }).eq("room_id", room.id);
          } else {
            // Single winner
            const gameWinner = sortedPlayers[0];
            await supabase.from("game_state").update({
              winner_name: gameWinner?.name,
              winner_score: topScore
            }).eq("room_id", room.id);
          }

          // Wait a bit for all players to receive the realtime update
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Reset all scores and set in_game to false (keep judge status unchanged)
          await supabase.from("players").update({
            score: 0,
            in_game: false
          }).eq("room_id", room.id);

          // Clear all submissions from all rounds
          await supabase.from("submissions").delete().eq("room_id", room.id);

          // Delete game state
          await supabase.from("game_state").delete().eq("room_id", room.id);

          // Clear all player hands
          await supabase.from("player_hands").delete().eq("room_id", room.id);

          // Return to lobby
          await supabase.from("rooms").update({
            status: "lobby"
          }).eq("id", room.id);
        }
      } else {
        // Continue to next round (keep judge status unchanged)
        const {
          data: inboxCards
        } = await supabase.from("cards").select("*").eq("type", "inbox");
        if (inboxCards && inboxCards.length > 0) {
          const randomInbox = inboxCards[Math.floor(Math.random() * inboxCards.length)];
          
          // Get all reply cards for dealing
          const { data: replyCards } = await supabase.from("cards").select("*").eq("type", "reply");
          
          if (replyCards && replyCards.length >= 6 * players.filter(p => !p.is_judge).length) {
            // First, wait a bit for the delete operation to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Double check that hands are cleared before dealing
            const { data: existingHands } = await supabase
              .from("player_hands")
              .select("id")
              .eq("room_id", room.id);
            
            if (existingHands && existingHands.length > 0) {
              // Force delete again if needed
              await supabase.from("player_hands").delete().eq("room_id", room.id);
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Shuffle all reply cards once
            const shuffledCards = [...replyCards].sort(() => Math.random() - 0.5);
            let cardIndex = 0;
            
            // Prepare all card assignments in a single batch
            const allCardInserts = [];
            const nonJudgePlayers = players.filter(p => !p.is_judge);
            
            for (const player of nonJudgePlayers) {
              // Give each player exactly 6 unique cards
              const playerCards = shuffledCards.slice(cardIndex, cardIndex + 6);
              cardIndex += 6;
              
              for (const card of playerCards) {
                allCardInserts.push({
                  player_id: player.id,
                  card_id: card.id,
                  room_id: room.id,
                });
              }
            }
            
            // Insert all cards at once - ignore duplicate key errors
            const { error: handError } = await supabase
              .from("player_hands")
              .insert(allCardInserts);
            
            if (handError && handError.code !== "23505") {
              // Only show error if it's not a duplicate key error
              console.error("Failed to deal cards:", handError);
              return;
            }
          }
          
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
  if (!gameState || !inboxCard) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">იტვირთება...</p>
        </div>
      </div>;
  }
  // Always use fresh data from players array to avoid stale state
  const currentPlayerData = players.find(p => p.id === currentPlayer.id);
  const isJudge = currentPlayerData?.is_judge || false;
  const hasSubmitted = submissions.some(s => s.player_id === currentPlayer.id);
  return <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* Return to Lobby Button */}
        <div className="flex justify-start">
          <Button variant="outline" onClick={onReturnToLobby} className="h-9 sm:h-10 text-xs sm:text-sm touch-manipulation hover:bg-secondary hover:text-secondary-foreground">
            ← გასვლა
          </Button>
        </div>

        {/* Header with Round and Scoreboard */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold whitespace-nowrap">
              რაუნდი {gameState.round_number} / {gameState.max_rounds}
            </h2>
            <div className="px-3 py-1 sm:px-4 sm:py-2 bg-accent/20 text-accent rounded-full text-xs sm:text-sm font-medium whitespace-nowrap">
              {isJudge ? "მსაჯული" : "ხუმარა"}
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <Scoreboard players={players} roomId={room.id} />
          </div>
        </div>

        {/* Inbox Card */}
        <div className="flex justify-center px-2 sm:px-4">
          <div className="w-full max-w-[280px] sm:max-w-md md:max-w-xl">
            <GameCard text={inboxCard.text_ge} type="inbox" size="large" className="animate-card-deal" />
          </div>
        </div>

        {/* Round Table - Shows submitted cards for all players */}
        {(gameState.phase === "submitting" || gameState.phase === "judging") && <div className="flex justify-center my-6 sm:my-8 px-2">
            <div className="relative w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-full bg-gradient-to-br from-green-600 to-green-800 shadow-2xl flex items-center justify-center">
              {/* Table surface shine effect */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/5 to-transparent pointer-events-none"></div>
              
              {/* Center decoration */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-full bg-green-900/50 border-2 sm:border-4 border-green-700/30"></div>
              </div>
              
              {/* Submitted cards arranged in a circle */}
              <div className="relative w-full h-full z-10">
                {submissions.map((submission: any, index) => {
              const angle = index * 360 / Math.max(players.length - 1, 3);
              // Responsive radius: smaller for mobile, larger for desktop
              const radius = typeof window !== 'undefined' && window.innerWidth < 640 ? 90 : window.innerWidth < 768 ? 110 : 140;
              const x = Math.cos((angle - 90) * Math.PI / 180) * radius;
              const y = Math.sin((angle - 90) * Math.PI / 180) * radius;
              return <div key={submission.id} className="absolute animate-card-deal z-20" style={{
                top: '50%',
                left: '50%',
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                animationDelay: `${index * 0.2}s`
              }}>
                      <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                        <button type="button" disabled={!(isJudge && gameState.phase === "judging")} className={`w-16 h-24 sm:w-20 sm:h-28 bg-white rounded-lg shadow-xl flex items-center justify-center p-1 sm:p-1.5 border-2 touch-manipulation ${isJudge && gameState.phase === "judging" ? "cursor-pointer hover:scale-110 hover:shadow-2xl hover:border-primary border-gray-200 transition-all duration-200 active:scale-95" : "border-gray-200 cursor-default"}`} onClick={e => {
                    const canClick = isJudge && gameState.phase === "judging";
                    console.log('Card clicked!', {
                      isJudge,
                      phase: gameState.phase,
                      canClick,
                      cardId: submission.card_id
                    });
                    if (canClick) {
                      e.stopPropagation();
                      handleSelectWinner(submission.card_id);
                    } else {
                      console.log('Cannot click: isJudge=', isJudge, 'phase=', gameState.phase);
                    }
                  }}>
                          <span className="text-[8px] sm:text-[10px] text-center font-medium text-gray-800 line-clamp-5 leading-tight pointer-events-none">
                            {submission.cards?.text_ge}
                          </span>
                        </button>
                      </div>
                    </div>;
            })}
              </div>
            </div>
          </div>}

        {/* Game Phase Content */}
        {gameState.phase === "submitting" && isJudge && <div className="text-center px-4">
            <p className="text-base sm:text-lg text-muted-foreground">
              მოიცადე სანამ ყველა ხუმარა აირჩევს ბარათს...
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-2">
              გაგზავნილია: {submissions.length} / {players.filter(p => !p.is_judge && p.in_game).length}
            </p>
          </div>}
        {gameState.phase === "submitting" && !isJudge && <div className="space-y-3 sm:space-y-4">
            {hasSubmitted ? <p className="text-center text-base sm:text-lg text-muted-foreground px-4">მოიცადე სანამ ყველა ხუმარა აირჩევს ბარათს...</p> : <>
                <p className="text-center text-base sm:text-lg px-4">
                  აირჩიე შენი ყველაზე სასაცილო პასუხი:
                </p>
                <div className="relative w-full max-w-[280px] sm:max-w-md mx-auto">
                  {/* Carousel Container */}
                  <div className="overflow-hidden" ref={emblaRef}>
                    <div className="flex">
                      {playerCards.slice(0, 6).map(card => <div key={card.id} className="flex-[0_0_100%] min-w-0 flex justify-center items-center px-2 sm:px-4">
                          <div className="w-40 h-56 sm:w-48 sm:h-64">
                            <GameCard text={card.text_ge} type="reply" isSelected={selectedCard === card.id} onClick={() => setSelectedCard(card.id)} className="cursor-pointer touch-manipulation" />
                          </div>
                        </div>)}
                    </div>
                  </div>

                  {/* Navigation Buttons */}
                  <Button variant="outline" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 sm:h-10 sm:w-10 touch-manipulation" onClick={() => emblaApi?.scrollPrev()} disabled={currentCardIndex === 0}>
                    <ChevronLeft className="h-4 w-4 sm:h-6 sm:w-6" />
                  </Button>
                  <Button variant="outline" size="icon" className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 sm:h-10 sm:w-10 touch-manipulation" onClick={() => emblaApi?.scrollNext()} disabled={currentCardIndex === playerCards.slice(0, 6).length - 1}>
                    <ChevronRight className="h-4 w-4 sm:h-6 sm:w-6" />
                  </Button>

                  {/* Card Indicators */}
                  <div className="flex justify-center gap-1.5 sm:gap-2 mt-3 sm:mt-4">
                    {playerCards.slice(0, 6).map((_, index) => <button key={index} className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all touch-manipulation ${index === currentCardIndex ? "bg-primary w-4 sm:w-6" : "bg-muted-foreground/30"}`} onClick={() => emblaApi?.scrollTo(index)} />)}
                  </div>
                </div>

                <div className="flex justify-center mt-4 sm:mt-6 px-4">
                  <Button onClick={handleSubmitCard} disabled={!selectedCard} className="px-6 py-5 sm:px-8 sm:py-6 text-base sm:text-lg font-bold bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity touch-manipulation w-full sm:w-auto">
                    ბარათის გაგზავნა
                  </Button>
                </div>
              </>}
          </div>}

        {gameState.phase === "judging" && isJudge && <div className="space-y-3 sm:space-y-4 px-4">
            <p className="text-center text-base sm:text-lg font-semibold">
              აირჩიე ყველაზე სასაცილო პასუხი მაგიდიდან:
            </p>
          </div>}


        {gameState.phase === "judging" && !isJudge && <div className="text-center py-8 sm:py-12 px-4">
            <Users className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-3 sm:mb-4 text-primary animate-pulse" />
            <p className="text-base sm:text-xl">დაელოდეთ მსაჯულის გადაწყვეტილებას...</p>
          </div>}
      </div>
    </div>;
};
export default GameBoard;