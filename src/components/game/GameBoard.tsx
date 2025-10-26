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
    loadGameData();
    const unsubscribe = subscribeToSubmissions();
    return unsubscribe;
  }, [gameState?.round_number, gameState?.phase, currentPlayer.id]);
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

    // Load inbox card
    if (gameState.current_inbox_card_id) {
      const {
        data: inboxData
      } = await supabase.from("cards").select("*").eq("id", gameState.current_inbox_card_id).single();
      if (inboxData) setInboxCard(inboxData);
    }

    // Load player's hand (only if not judge)
    if (!currentPlayer.is_judge && gameState.phase === "submitting") {
      // Load existing cards from database
      const {
        data: handData
      } = await supabase.from("player_hands").select("card_id, cards(*)").eq("player_id", currentPlayer.id).eq("room_id", room.id);
      if (handData) {
        const cards = handData.map((h: any) => h.cards).filter(Boolean);
        setPlayerCards(cards);
      }
    }

    // Load submissions for all phases (so players can see cards on table)
    const {
      data: submissionsData
    } = await supabase.from("submissions").select("*, cards(*), players(name)").eq("room_id", room.id).eq("round_number", gameState.round_number);
    if (submissionsData) {
      setSubmissions(submissionsData);
      const cards = submissionsData.map((s: any) => s.cards).filter(Boolean);
      setSubmittedCards(cards);
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
        const {
          data: submissionsData
        } = await supabase.from("submissions").select("*, cards(*), players(name)").eq("room_id", room.id).eq("round_number", gameState.round_number);
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
      const nonJudgePlayers = players.filter(p => !p.is_judge);
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
    if (!currentPlayer.is_judge || !gameState) return;
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

          // Reset all scores (keep judge status unchanged)
          await supabase.from("players").update({
            score: 0
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
  const isJudge = currentPlayer.is_judge;
  const hasSubmitted = submissions.some(s => s.player_id === currentPlayer.id);
  return <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Return to Lobby Button */}
        <div className="flex justify-start">
          <Button variant="outline" onClick={onReturnToLobby} className="hover:bg-secondary hover:text-secondary-foreground">
            ← გასვლა ოთახში
          </Button>
        </div>

        {/* Header with Round and Scoreboard */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold">
              რაუნდი {gameState.round_number} / {gameState.max_rounds}
            </h2>
            <div className="px-4 py-2 bg-accent/20 text-accent rounded-full text-sm font-medium">
              შენ ხარ {isJudge ? "მსაჯული" : "ხუმარა"}
            </div>
          </div>
          <Scoreboard players={players} />
        </div>

        {/* Inbox Card */}
        <div className="flex justify-center">
          <GameCard text={inboxCard.text_ge} type="inbox" size="large" className="animate-card-deal" />
        </div>

        {/* Round Table - Shows submitted cards for all players */}
        {(gameState.phase === "submitting" || gameState.phase === "judging") && <div className="flex justify-center my-8">
            <div className="relative w-96 h-96 rounded-full bg-gradient-to-br from-green-600 to-green-800 shadow-2xl flex items-center justify-center">
              {/* Table surface shine effect */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/5 to-transparent pointer-events-none"></div>
              
              {/* Center decoration */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-16 h-16 rounded-full bg-green-900/50 border-4 border-green-700/30"></div>
              </div>
              
              {/* Submitted cards arranged in a circle */}
              <div className="relative w-full h-full z-10">
                {submissions.map((submission: any, index) => {
              const angle = index * 360 / Math.max(players.length - 1, 3);
              const radius = 140;
              const x = Math.cos((angle - 90) * Math.PI / 180) * radius;
              const y = Math.sin((angle - 90) * Math.PI / 180) * radius;
              return <div key={submission.id} className="absolute animate-card-deal z-20" style={{
                top: '50%',
                left: '50%',
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                animationDelay: `${index * 0.2}s`
              }}>
                      <div className="flex flex-col items-center gap-1">
                        <button type="button" disabled={!(isJudge && gameState.phase === "judging")} className={`w-20 h-28 bg-white rounded-lg shadow-xl flex items-center justify-center p-2 border-2 ${isJudge && gameState.phase === "judging" ? "cursor-pointer hover:scale-110 hover:shadow-2xl hover:border-primary border-gray-200 transition-all duration-200 active:scale-95" : "border-gray-200 cursor-default"}`} onClick={e => {
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
                          <span className="text-xs text-center font-medium text-gray-800 line-clamp-4 pointer-events-none">
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
        {gameState.phase === "submitting" && isJudge && <div className="text-center">
            <p className="text-lg text-muted-foreground">
              მოიცადე სანამ ყველა ხუმარა აირჩევს ბარათს...
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              გაგზავნილია: {submissions.length} / {players.filter(p => !p.is_judge).length}
            </p>
          </div>}
        {gameState.phase === "submitting" && !isJudge && <div className="space-y-4">
            {hasSubmitted ? <p className="text-center text-lg text-muted-foreground">მოიცადე სანამ ყველა ხუმარა აირჩევს ბარათს...</p> : <>
                <p className="text-center text-lg">
                  აირჩიე შენი ყველაზე სასაცილო პასუხი:
                </p>
                <div className="relative w-full max-w-md mx-auto">
                  {/* Carousel Container */}
                  <div className="overflow-hidden" ref={emblaRef}>
                    <div className="flex">
                      {playerCards.slice(0, 6).map(card => <div key={card.id} className="flex-[0_0_100%] min-w-0 flex justify-center items-center px-4">
                          <GameCard text={card.text_ge} type="reply" isSelected={selectedCard === card.id} onClick={() => setSelectedCard(card.id)} className="cursor-pointer w-48 h-64" />
                        </div>)}
                    </div>
                  </div>

                  {/* Navigation Buttons */}
                  <Button variant="outline" size="icon" className="absolute left-0 top-1/2 -translate-y-1/2 z-10" onClick={() => emblaApi?.scrollPrev()} disabled={currentCardIndex === 0}>
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button variant="outline" size="icon" className="absolute right-0 top-1/2 -translate-y-1/2 z-10" onClick={() => emblaApi?.scrollNext()} disabled={currentCardIndex === playerCards.slice(0, 6).length - 1}>
                    <ChevronRight className="h-6 w-6" />
                  </Button>

                  {/* Card Indicators */}
                  <div className="flex justify-center gap-2 mt-4">
                    {playerCards.slice(0, 6).map((_, index) => <button key={index} className={`w-2 h-2 rounded-full transition-all ${index === currentCardIndex ? "bg-primary w-6" : "bg-muted-foreground/30"}`} onClick={() => emblaApi?.scrollTo(index)} />)}
                  </div>
                </div>

                <div className="flex justify-center mt-6">
                  <Button onClick={handleSubmitCard} disabled={!selectedCard} className="px-8 py-6 text-lg font-bold bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity">
                    ბარათის გაგზავნა
                  </Button>
                </div>
              </>}
          </div>}

        {gameState.phase === "judging" && isJudge && <div className="space-y-4">
            <p className="text-center text-lg font-semibold">
              აირჩიე ყველაზე სასაცილო პასუხი მაგიდიდან:
            </p>
          </div>}


        {gameState.phase === "judging" && !isJudge && <div className="text-center py-12">
            <Users className="h-16 w-16 mx-auto mb-4 text-primary animate-pulse" />
            <p className="text-xl">დაელოდეთ მსაჯულის გადაწყვეტილებას...</p>
          </div>}
      </div>
    </div>;
};
export default GameBoard;