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
  room: { id: string };
  players: Player[];
  currentPlayer: Player;
  gameState: GameState | null;
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

const GameBoard = ({ room, players, currentPlayer, gameState }: GameBoardProps) => {
  const { toast } = useToast();
  const [inboxCard, setInboxCard] = useState<CardData | null>(null);
  const [playerCards, setPlayerCards] = useState<CardData[]>([]);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submittedCards, setSubmittedCards] = useState<CardData[]>([]);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "center" });
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
      const { data: inboxData } = await supabase
        .from("cards")
        .select("*")
        .eq("id", gameState.current_inbox_card_id)
        .single();
      if (inboxData) setInboxCard(inboxData);
    }

    // Load player's hand (only if not judge)
    if (!currentPlayer.is_judge) {
      const { data: handData } = await supabase
        .from("player_hands")
        .select("card_id, cards(*)")
        .eq("player_id", currentPlayer.id)
        .eq("room_id", room.id);

      const currentCards = handData?.map((h: any) => h.cards).filter(Boolean) || [];
      const currentCardCount = currentCards.length;
      
      console.log(`Player ${currentPlayer.name} has ${currentCardCount} cards at round ${gameState.round_number}`);
      
      // If player has fewer than 6 cards, deal new ones
      if (currentCardCount < 6) {
        const cardsNeeded = 6 - currentCardCount;
        
        // Get all reply cards
        const { data: replyCards } = await supabase
          .from("cards")
          .select("*")
          .eq("type", "reply");
        
        if (replyCards) {
          // Get current player's card IDs to avoid duplicates in their hand
          const currentCardIds = new Set(currentCards.map(c => c.id));
          
          // Filter out cards that are already in THIS player's hand
          // Cards can repeat across different players or rounds, but not in same hand
          const availableCards = replyCards.filter(card => !currentCardIds.has(card.id));
          
          // Shuffle and take needed cards
          const shuffled = [...availableCards].sort(() => Math.random() - 0.5);
          const newCards = shuffled.slice(0, cardsNeeded);
          
          console.log(`Adding ${newCards.length} new cards to player ${currentPlayer.name}`);
          
          // Add new cards to player's hand
          for (const card of newCards) {
            await supabase.from("player_hands").insert({
              player_id: currentPlayer.id,
              card_id: card.id,
              room_id: room.id,
            });
          }
          
          // Reload hand data after adding cards
          const { data: updatedHandData } = await supabase
            .from("player_hands")
            .select("card_id, cards(*)")
            .eq("player_id", currentPlayer.id)
            .eq("room_id", room.id);
          
          const updatedCards = updatedHandData?.map((h: any) => h.cards).filter(Boolean) || [];
          console.log(`Player ${currentPlayer.name} now has ${updatedCards.length} cards after dealing`);
          setPlayerCards(updatedCards);
        }
      } else {
        console.log(`Player ${currentPlayer.name} already has enough cards`);
        setPlayerCards(currentCards);
      }
    }

    // Load submissions for judging phase
    if (gameState.phase === "judging" || gameState.phase === "revealing") {
      const { data: submissionsData } = await supabase
        .from("submissions")
        .select("*, cards(*)")
        .eq("room_id", room.id)
        .eq("round_number", gameState.round_number);

      if (submissionsData) {
        setSubmissions(submissionsData);
        const cards = submissionsData.map((s: any) => s.cards).filter(Boolean);
        setSubmittedCards(cards);
      }
    }
  };

  const subscribeToSubmissions = () => {
    const submissionsChannel = supabase
      .channel(`submissions_${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          loadGameData();
        }
      )
      .subscribe();

    const gameStateChannel = supabase
      .channel(`game_state_${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_state",
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          console.log("Game state changed, reloading data");
          loadGameData();
        }
      )
      .subscribe();

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
        round_number: gameState.round_number,
      });

      // Remove the card from player's hand
      await supabase
        .from("player_hands")
        .delete()
        .eq("player_id", currentPlayer.id)
        .eq("card_id", selectedCard)
        .eq("room_id", room.id);

      toast({
        title: "ბარათი გაგზავნილია!",
      });

      setSelectedCard(null);

      // Check if all non-judge players have submitted
      const nonJudgePlayers = players.filter((p) => !p.is_judge);
      const { data: currentSubmissions } = await supabase
        .from("submissions")
        .select("*")
        .eq("room_id", room.id)
        .eq("round_number", gameState.round_number);

      if (currentSubmissions && currentSubmissions.length === nonJudgePlayers.length) {
        await supabase
          .from("game_state")
          .update({ phase: "judging" })
          .eq("room_id", room.id);
      }
    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "ბარათის გაგზავნა ვერ მოხერხდა",
        variant: "destructive",
      });
    }
  };

  const handleSelectWinner = async (cardId: string) => {
    if (!currentPlayer.is_judge || !gameState) return;

    const winningSubmission = submissions.find((s) => s.card_id === cardId);
    if (!winningSubmission) return;

    try {
      // Mark winner
      await supabase
        .from("submissions")
        .update({ is_winner: true })
        .eq("id", winningSubmission.id);

      // Update winner's score
      const winner = players.find((p) => p.id === winningSubmission.player_id);
      if (winner) {
        await supabase
          .from("players")
          .update({ score: winner.score + 1 })
          .eq("id", winner.id);
      }

      // Clear submissions for next round first
      await supabase
        .from("submissions")
        .delete()
        .eq("room_id", room.id)
        .eq("round_number", gameState.round_number);

      // Check if this was the last round
      if (gameState.round_number >= gameState.max_rounds) {
        // Game is over, find the winner(s)
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
        const topScore = sortedPlayers[0]?.score || 0;
        const winners = sortedPlayers.filter(p => p.score === topScore && !p.is_judge);
        
        // The highest scorer becomes the judge for next game
        const newJudge = winners.length > 0 ? winners[0] : sortedPlayers.find(p => !p.is_judge);

        if (newJudge) {
          // Set all players as non-judge
          await supabase
            .from("players")
            .update({ is_judge: false })
            .eq("room_id", room.id);
          
          // Set new judge
          await supabase
            .from("players")
            .update({ is_judge: true })
            .eq("id", newJudge.id);
        }

        // Reset all scores
        await supabase
          .from("players")
          .update({ score: 0 })
          .eq("room_id", room.id);

        // Delete game state
        await supabase
          .from("game_state")
          .delete()
          .eq("room_id", room.id);

        // Clear all player hands
        await supabase
          .from("player_hands")
          .delete()
          .eq("room_id", room.id);

        // Return to lobby
        await supabase
          .from("rooms")
          .update({ status: "lobby" })
          .eq("id", room.id);

        toast({
          title: "თამაში დასრულდა!",
          description: winners.length === 1 
            ? `${winners[0].name} არის გამარჯვებული! ${topScore} ქულით!`
            : `გამარჯვებულები: ${winners.map(w => w.name).join(", ")} - ${topScore} ქულით!`,
        });
      } else {
        // Continue to next round
        // Judge stays the same
        const { data: inboxCards } = await supabase
          .from("cards")
          .select("*")
          .eq("type", "inbox");

        if (inboxCards && inboxCards.length > 0) {
          const randomInbox = inboxCards[Math.floor(Math.random() * inboxCards.length)];

          await supabase
            .from("game_state")
            .update({
              phase: "submitting",
              current_inbox_card_id: randomInbox.id,
              round_number: gameState.round_number + 1,
            })
            .eq("room_id", room.id);
        }

        toast({
          title: "გამარჯვებული შეირჩა!",
          description: `${winner?.name} მოიგო ეს რაუნდი!`,
        });
      }
    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "გამარჯვებულის შერჩევა ვერ მოხერხდა",
        variant: "destructive",
      });
    }
  };

  if (!gameState || !inboxCard) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">იტვირთება...</p>
        </div>
      </div>
    );
  }

  const isJudge = currentPlayer.is_judge;
  const hasSubmitted = submissions.some((s) => s.player_id === currentPlayer.id);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Round and Scoreboard */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold">
              რაუნდი {gameState.round_number} / {gameState.max_rounds}
            </h2>
            {isJudge && (
              <div className="px-4 py-2 bg-accent/20 text-accent rounded-full text-sm font-medium flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                <span>შენ ხარ მსაჯული</span>
              </div>
            )}
          </div>
          <Scoreboard players={players} />
        </div>

        {/* Inbox Card */}
        <div className="flex justify-center">
          <GameCard
            text={inboxCard.text_ge}
            type="inbox"
            size="large"
            className="animate-card-deal"
          />
        </div>

        {/* Game Phase Content */}
        {gameState.phase === "submitting" && !isJudge && (
          <div className="space-y-4">
            <p className="text-center text-lg">
              აირჩიე შენი ყველაზე სასაცილო პასუხი:
            </p>

            {!hasSubmitted && (
              <>
                <div className="relative w-full max-w-md mx-auto">
                  {/* Carousel Container */}
                  <div className="overflow-hidden" ref={emblaRef}>
                    <div className="flex">
                      {playerCards.slice(0, 6).map((card) => (
                        <div
                          key={card.id}
                          className="flex-[0_0_100%] min-w-0 flex justify-center items-center px-4"
                        >
                          <GameCard
                            text={card.text_ge}
                            type="reply"
                            isSelected={selectedCard === card.id}
                            onClick={() => setSelectedCard(card.id)}
                            className="cursor-pointer w-48 h-64"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Navigation Buttons */}
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10"
                    onClick={() => emblaApi?.scrollPrev()}
                    disabled={currentCardIndex === 0}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10"
                    onClick={() => emblaApi?.scrollNext()}
                    disabled={currentCardIndex === playerCards.slice(0, 6).length - 1}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>

                  {/* Card Indicators */}
                  <div className="flex justify-center gap-2 mt-4">
                    {playerCards.slice(0, 6).map((_, index) => (
                      <button
                        key={index}
                        className={`w-2 h-2 rounded-full transition-all ${
                          index === currentCardIndex
                            ? "bg-primary w-6"
                            : "bg-muted-foreground/30"
                        }`}
                        onClick={() => emblaApi?.scrollTo(index)}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex justify-center mt-6">
                  <Button
                    onClick={handleSubmitCard}
                    disabled={!selectedCard}
                    className="px-8 py-6 text-lg font-bold bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
                  >
                    ბარათის გაგზავნა
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {gameState.phase === "judging" && isJudge && (
          <div className="space-y-4">
            <p className="text-center text-lg font-semibold">
              აირჩიე ყველაზე სასაცილო პასუხი:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {submittedCards.map((card, index) => (
                <GameCard
                  key={card.id}
                  text={card.text_ge}
                  type="reply"
                  onClick={() => handleSelectWinner(card.id)}
                  className="cursor-pointer hover:scale-105 transition-transform"
                  style={{ animationDelay: `${index * 0.1}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {gameState.phase === "submitting" && isJudge && (
          <div className="text-center py-12">
            <Trophy className="h-16 w-16 mx-auto mb-4 text-accent animate-pulse-glow" />
            <p className="text-xl">შენ ხარ მსაჯული ამ რაუნდში</p>
            <p className="text-muted-foreground mt-2">
              დაელოდე სანამ ყველა მოთამაშე გააგზავნის ბარათს
            </p>
          </div>
        )}

        {gameState.phase === "judging" && !isJudge && (
          <div className="text-center py-12">
            <Users className="h-16 w-16 mx-auto mb-4 text-primary animate-pulse" />
            <p className="text-xl">დაელოდეთ მსაჯულის გადაწყვეტილებას...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameBoard;
