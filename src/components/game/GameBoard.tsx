import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronsLeft, Gavel, Inbox, Layers, LogOut, Send, Trophy, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
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
  winner_name?: string | null;
  winner_score?: number | null;
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
  cards?: CardData | null;
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
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const fanDragRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const fanDidDragRef = useRef(false);
  const handCards = useMemo(() => playerCards.slice(0, 6), [playerCards]);
  const currentPlayerData = players.find(p => p.id === currentPlayer.id);
  const isJudge = currentPlayerData?.is_judge || false;
  const hasSubmitted = submissions.some((submission) => submission.player_id === currentPlayer.id);
  const activeComedians = useMemo(() => players.filter((player) => !player.is_judge && player.in_game), [players]);
  const roundProgress = gameState?.max_rounds ? (gameState.round_number / gameState.max_rounds) * 100 : 0;
  const playableCards = gameState?.phase === "judging" ? submittedCards : handCards;
  const activeCardIndex = Math.max(0, Math.min(currentCardIndex, Math.max(playableCards.length - 1, 0)));

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
    if (handCards.length === 0) {
      setCurrentCardIndex(0);
      setSelectedCard(null);
    }
  }, [handCards.length]);

  useEffect(() => {
    setCurrentCardIndex(0);
  }, [gameState?.round_number, gameState?.phase]);

  useEffect(() => {
    if (gameState?.phase === "submitting" && !isJudge && !hasSubmitted && handCards.length > 0 && !selectedCard) {
      setSelectedCard(handCards[0].id);
    }
  }, [gameState?.phase, handCards, hasSubmitted, isJudge, selectedCard]);

  useEffect(() => {
    document.documentElement.classList.add("game-native-locked");
    document.body.classList.add("game-native-locked");

    return () => {
      document.documentElement.classList.remove("game-native-locked");
      document.body.classList.remove("game-native-locked");
    };
  }, []);

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
        const cards = handData.map((h) => h.cards).filter(Boolean);
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
      const cards = submissionsData.map((s) => s.cards).filter(Boolean);
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
          const cards = submissionsData.map((s) => s.cards).filter(Boolean);
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
    return (
      <div className="app-shell">
        <div className="screen items-center justify-center">
          <div className="soft-panel w-full p-6 text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            <p className="text-sm font-bold text-text-soft">იტვირთება...</p>
          </div>
        </div>
      </div>
    );
  }

  const roleLabel = isJudge ? "მსაჯული" : "ხუმარა";
  const fanCards = playableCards.slice(0, 6);
  const canChooseAnswer = gameState.phase === "submitting" && !isJudge && !hasSubmitted;
  const canJudgeCards = gameState.phase === "judging" && isJudge;
  const showCardFan = canChooseAnswer || gameState.phase === "judging";

  const getFanCardStyle = (index: number) => {
    const relativeIndex = index - activeCardIndex;
    const clampedIndex = Math.max(-3, Math.min(3, relativeIndex));
    const depth = Math.abs(clampedIndex);

    return {
      "--fan-x": `${clampedIndex * 4.35}rem`,
      "--fan-y": `${depth * 0.72}rem`,
      "--fan-r": `${clampedIndex * 8}deg`,
      "--fan-scale": `${clampedIndex === 0 ? 1 : 0.88 - Math.min(depth, 2) * 0.035}`,
      "--fan-z": `${30 - depth}`,
      "--fan-opacity": `${clampedIndex === 0 ? 1 : Math.max(0.34, 0.72 - depth * 0.1)}`,
    } as CSSProperties;
  };

  const handleFanCardClick = (card: CardData, index: number) => {
    if (fanDidDragRef.current) {
      return;
    }

    setCurrentCardIndex(index);

    if (canChooseAnswer) {
      setSelectedCard(card.id);
      return;
    }

    if (canJudgeCards) {
      handleSelectWinner(card.id);
    }
  };

  const snapFanToIndex = (nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(nextIndex, fanCards.length - 1));
    setCurrentCardIndex(boundedIndex);

    if (canChooseAnswer && fanCards[boundedIndex]) {
      setSelectedCard(fanCards[boundedIndex].id);
    }
  };

  const handleFanPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (fanCards.length < 2) return;

    fanDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
    fanDidDragRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleFanPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!fanDragRef.current) return;

    const deltaX = event.clientX - fanDragRef.current.x;
    const deltaY = event.clientY - fanDragRef.current.y;

    if (Math.abs(deltaX) < 34 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) {
      return;
    }

    fanDidDragRef.current = true;
    snapFanToIndex(activeCardIndex + (deltaX < 0 ? 1 : -1));
    fanDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
    event.preventDefault();
  };

  const handleFanPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (fanDragRef.current?.pointerId === event.pointerId) {
      fanDragRef.current = null;
    }

    window.setTimeout(() => {
      fanDidDragRef.current = false;
    }, 0);
  };

  return (
    <div className="app-shell game-native-shell game-reference-shell">
      <main className="game-reference-screen">
        <header className="reference-nav">
          <Button variant="surface" size="icon" className="reference-nav-button" onClick={onReturnToLobby} aria-label="ლობის დაბრუნება">
            <LogOut className="h-5 w-5" />
          </Button>

          <Badge variant={isJudge ? "secondary" : "primary"} className="reference-role-pill">
            {isJudge ? <Gavel /> : <Users />}
            {roleLabel}
          </Badge>
        </header>

        <section className="reference-status-grid" aria-label="თამაშის სტატუსი">
          <div className="reference-status-card reference-status-card-left">
            <div className="reference-status-icon">
              <Layers className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="reference-status-label">ROUND {gameState.round_number}</p>
              <h1 className="reference-status-title truncate">{roleLabel}</h1>
            </div>
            <div className="reference-muted-line" />
          </div>

          <div className="reference-status-card reference-status-card-right">
            <p className="reference-status-label">GAME STATE</p>
            <h2 className="reference-round-text">რაუნდი {gameState.round_number} / {gameState.max_rounds}</h2>
            <Progress value={roundProgress} className="reference-progress" />
          </div>
        </section>

        <section className="reference-play-area" aria-label="მთავარი სათამაშო მაგიდა">
          <article className="reference-question-card">
            <div className="reference-question-head">
              <div className="reference-question-icon">
                <Inbox className="h-5 w-5" />
              </div>
              <span className="reference-question-pill">INBOX</span>
            </div>
            <p className="reference-question-text">{inboxCard.text_ge}</p>
            <div className="reference-question-line" />
          </article>

          <div className="reference-table-perspective" aria-hidden="true">
            <div className="reference-table-felt" />
          </div>

          <aside className="reference-score-tab" aria-label="ქულები">
            <Trophy className="h-5 w-5" />
            <span>SCORE</span>
            <ChevronsLeft className="h-4 w-4" />
          </aside>

          <div
            className="reference-answer-fan"
            aria-label="ბარათების არჩევა"
            onPointerDown={handleFanPointerDown}
            onPointerMove={handleFanPointerMove}
            onPointerUp={handleFanPointerEnd}
            onPointerCancel={handleFanPointerEnd}
          >
            {showCardFan && fanCards.length > 0 ? (
              fanCards.map((card, index) => {
                const isActive = index === activeCardIndex;
                const isPressed = canChooseAnswer ? selectedCard === card.id : isActive;

                return (
                  <button
                    type="button"
                    key={card.id}
                    className={cn("reference-answer-card", isActive ? "reference-answer-card-active" : "reference-answer-card-side")}
                    style={getFanCardStyle(index)}
                    aria-pressed={isPressed}
                    onClick={() => handleFanCardClick(card, index)}
                  >
                    <div className="reference-answer-head">
                      <span className="reference-answer-icon">
                        <Inbox className="h-4 w-4" />
                      </span>
                      <span className="reference-answer-label">{card.type === "inbox" ? "INBOX" : "REPLY"}</span>
                    </div>
                    <span className="reference-answer-text">{card.text_ge}</span>
                    <span className="reference-answer-strip" />
                  </button>
                );
              })
            ) : (
              <div className="reference-state-message">
                {gameState.phase === "submitting" && isJudge && (
                  <>
                    <Trophy className="h-8 w-8 text-accent" />
                    <p>ბარათები იგზავნება</p>
                    <span>გაგზავნილია {submissions.length} / {activeComedians.length}</span>
                  </>
                )}

                {gameState.phase === "submitting" && !isJudge && hasSubmitted && (
                  <>
                    <Send className="h-8 w-8 text-primary" />
                    <p>პასუხი გაგზავნილია</p>
                    <span>დაელოდე სხვა მოთამაშეებს</span>
                  </>
                )}

                {gameState.phase === "judging" && !isJudge && (
                  <>
                    <Users className="h-8 w-8 text-primary" />
                    <p>მსაჯული არჩევს</p>
                    <span>დაელოდეთ გადაწყვეტილებას</span>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        <footer className="reference-bottom-action">
          <div className="reference-card-progress">
            {fanCards.map((_, index) => (
              <button
                type="button"
                key={index}
                className={cn("reference-card-dot", index === activeCardIndex && "reference-card-dot-active")}
                onClick={() => {
                  setCurrentCardIndex(index);
                  if (canChooseAnswer && fanCards[index]) {
                    setSelectedCard(fanCards[index].id);
                  }
                }}
                aria-label={`ბარათი ${index + 1}`}
              />
            ))}
          </div>

          <Button
            onClick={handleSubmitCard}
            disabled={!canChooseAnswer || !selectedCard || handCards.length === 0}
            size="lg"
            className="reference-send-button"
          >
            <Send className="h-5 w-5" />
            {canChooseAnswer
              ? "ბარათის გაგზავნა"
              : gameState.phase === "judging" && isJudge
                ? "აირჩიე გამარჯვებული"
                : gameState.phase === "judging"
                  ? "მსაჯული არჩევს"
                  : hasSubmitted
                    ? "პასუხი გაგზავნილია"
                    : "ბარათები იგზავნება"}
          </Button>
        </footer>
      </main>
    </div>
  );

};
export default GameBoard;
