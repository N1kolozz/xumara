import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock, Crown, Gavel, Home, LogOut, MessageCircle, Pencil, RotateCcw, Send, Trophy, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { vibrate } from "@/lib/haptics";
import { Player, GameState, Room, CardData, Submission } from "@/types/game";
import { useGameBoardData } from "@/hooks/useGameBoardData";
import { useGameBoardActions } from "@/hooks/useGameBoardActions";
import { BLANK_CARD_ID, BLANK_CARD_TEXT, HAND_SIZE, REACTION_EMOJIS, REVEAL_PER_CARD_MS } from "@/lib/gameConfig";
import s from "./GameBoard.module.css";

// Permanent "write-your-own" card appended to every hand (the 6th slot).
const BLANK_CARD: CardData = { id: BLANK_CARD_ID, text_ge: BLANK_CARD_TEXT, type: "reply", is_blank: true };

// Stable-ish horizontal spawn position for a floating reaction (15%–85%).
const reactionX = (id: string) => 15 + (id.charCodeAt(id.length - 1) % 70);

interface GameBoardProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  gameState: GameState | null;
  onReturnToLobby: () => void;
  onRematch: () => void;
  onEndToLobby: () => void;
}

type FanDragState = {
  x: number;
  y: number;
  pointerId: number;
  cardId: string | null;
  cardIndex: number | null;
  mode: "idle" | "swipe" | "drag";
};

const GameBoard = ({
  room,
  players,
  currentPlayer,
  gameState,
  onReturnToLobby,
  onRematch,
  onEndToLobby,
}: GameBoardProps) => {
  const { inboxCard, playerCards, setPlayerCards, submissions, reactions, sendReaction, roundWinner } = useGameBoardData({
    room,
    players,
    currentPlayer,
    gameState,
  });

  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  const { handleSubmitCard, handleSelectWinner, isSelectingWinner, isSubmittingCard } = useGameBoardActions({
    room,
    players,
    currentPlayer,
    gameState,
    setPlayerCards,
    setSelectedCard,
  });

  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isScoreboardOpen, setIsScoreboardOpen] = useState(false);
  const [previewSubmission, setPreviewSubmission] = useState<Submission | null>(null);
  // Blank-card composer: null = closed, string = open with current draft text.
  const [blankInput, setBlankInput] = useState<string | null>(null);
  // Live countdown clock. (The card-reveal flip is CSS-driven — see below.)
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [draggingCard, setDraggingCard] = useState<{ card: CardData; x: number; y: number } | null>(null);
  const tableDropRef = useRef<HTMLDivElement | null>(null);
  const fanDragRef = useRef<FanDragState | null>(null);
  const fanDidDragRef = useRef(false);
  // RAF throttle refs — drag ghost updates are capped to one per animation frame.
  const rafIdRef = useRef<number | null>(null);
  const pendingDragPosRef = useRef<{ card: CardData; x: number; y: number } | null>(null);
  // 5 real cards + the permanent blank slot.
  const handCards = useMemo(() => [...playerCards.slice(0, HAND_SIZE), BLANK_CARD], [playerCards]);
  const currentPlayerData = useMemo(() => players.find(p => p.id === currentPlayer.id), [players, currentPlayer.id]);
  const isJudge = currentPlayerData?.is_judge ?? false;
  const hasSubmitted = useMemo(() => submissions.some((s) => s.player_id === currentPlayer.id), [submissions, currentPlayer.id]);
  const activeComedians = useMemo(() => players.filter((player) => !player.is_judge && player.in_game), [players]);
  const scorePlayers = useMemo(() => players.filter((player) => player.in_game).sort((a, b) => b.score - a.score), [players]);
  const scoreLeader = useMemo(() => scorePlayers.find((player) => !player.is_judge), [scorePlayers]);
  const currentJudge = useMemo(() => scorePlayers.find((player) => player.is_judge), [scorePlayers]);
  const roundProgress = useMemo(() => gameState?.max_rounds ? (gameState.round_number / gameState.max_rounds) * 100 : 0, [gameState?.round_number, gameState?.max_rounds]);
  const activeCardIndex = Math.max(0, Math.min(currentCardIndex, Math.max(handCards.length - 1, 0)));
  // Must be computed before the early return so hook call order is stable.
  // Sorted by submission id (a random uuid): deterministic and identical on
  // every client, but uncorrelated with submission time — so the judge can't
  // tell who answered first from the card positions.
  const tableCards = useMemo(
    () => submissions.filter((s) => s.cards).sort((a, b) => a.id.localeCompare(b.id)),
    [submissions],
  );

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
    if (gameState?.phase === "submitting" && !isJudge && !hasSubmitted && playerCards.length > 0 && !selectedCard) {
      setSelectedCard(playerCards[0].id);
    }
  }, [gameState?.phase, playerCards, hasSubmitted, isJudge, selectedCard]);

  useEffect(() => {
    document.documentElement.classList.add("game-native-locked");
    document.body.classList.add("game-native-locked");

    return () => {
      document.documentElement.classList.remove("game-native-locked");
      document.body.classList.remove("game-native-locked");
    };
  }, []);

  // Ticking clock for the round countdown.
  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  // The one-by-one card flip is driven purely by CSS (staggered animation-delay
  // on each table card — see referenceTableCardFlipper). This effect only fires
  // a light haptic tick timed to match each card's flip, so the buzz stays in
  // sync without any setState/re-render that could stutter the animation.
  useEffect(() => {
    if (gameState?.phase !== "revealing") return;
    const total = submissions.filter((sub) => sub.cards).length;
    const timers: number[] = [];
    for (let i = 0; i < total; i += 1) {
      timers.push(window.setTimeout(() => vibrate(10), i * REVEAL_PER_CARD_MS));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.phase, gameState?.round_number]);

  // Countdown derived before the early return so the haptic effects below can
  // keep a stable hook order.
  const currentPhase = gameState?.phase;
  const deadlineMs = gameState?.phase_deadline ? new Date(gameState.phase_deadline).getTime() : null;
  const secondsLeft = deadlineMs !== null ? Math.max(0, Math.ceil((deadlineMs - nowTs) / 1000)) : null;

  // ── Haptics (no-op where the Vibration API is unavailable) ────────────────
  // Nudge when it's your turn to act: a new submitting round (players) or the
  // judging phase opening (judge).
  useEffect(() => {
    if ((currentPhase === "submitting" && !isJudge) || (currentPhase === "judging" && isJudge)) {
      vibrate(30);
    }
  }, [currentPhase, gameState?.round_number, isJudge]);

  // Winner celebration — stronger buzz if it's you.
  useEffect(() => {
    if (!roundWinner) return;
    vibrate(roundWinner.playerId === currentPlayer.id ? [60, 40, 60] : 15);
  }, [roundWinner, currentPlayer.id]);

  // One warning buzz when the countdown enters the urgent zone.
  useEffect(() => {
    if (secondsLeft === 10 && (currentPhase === "submitting" || currentPhase === "judging")) {
      vibrate(20);
    }
  }, [secondsLeft, currentPhase]);

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
  const fanCards = handCards;
  const phase = gameState.phase;
  const isFinished = !!gameState.winner_name;
  const canChooseAnswer = phase === "submitting" && !isJudge && !hasSubmitted;
  const canJudgeCards = phase === "judging" && isJudge;
  const showReactions = phase === "revealing" || phase === "judging";
  const showCardFan = canChooseAnswer;

  // Round countdown (deadlineMs/secondsLeft are derived above the early return).
  const showTimer = !isFinished && secondsLeft !== null && (phase === "submitting" || phase === "judging");

  // Submitting a blank opens the composer; everything else submits directly.
  const submitCard = (cardId: string) => {
    if (cardId === BLANK_CARD_ID) {
      setBlankInput("");
      return;
    }
    void handleSubmitCard(cardId);
  };

  // Cards flip face-up the moment the reveal choreography starts and stay up
  // through judging. The stagger (and thus the one-by-one effect) lives entirely
  // in CSS via each card's --reveal-delay, so it can never lose a race with the
  // server's revealing→judging phase change.
  const revealActive = phase === "revealing" || phase === "judging";

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

  const getTableCardStyle = (index: number, total: number) => {
    const columns = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(total * 1.35))));
    const rows = Math.max(1, Math.ceil(total / columns));
    const row = Math.floor(index / columns);
    const start = row * columns;
    const itemsInRow = Math.min(columns, total - start);
    const col = index - start;
    const rowProgress = rows === 1 ? 0.62 : row / Math.max(rows - 1, 1);
    const rowWidth = 42 + rowProgress * 38;
    const x = itemsInRow === 1 ? 50 : 50 + (col - (itemsInRow - 1) / 2) * (rowWidth / Math.max(itemsInRow - 1, 1));
    const y = rows === 1 ? 48 : 34 + rowProgress * 36;

    return {
      "--table-card-x": `${x}%`,
      "--table-card-y": `${y}%`,
      "--table-card-r": `${(col - (itemsInRow - 1) / 2) * 4}deg`,
      "--table-card-z": `${20 + row}`,
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
  };

  const snapFanToIndex = (nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(nextIndex, fanCards.length - 1));
    setCurrentCardIndex(boundedIndex);

    if (canChooseAnswer && fanCards[boundedIndex]) {
      setSelectedCard(fanCards[boundedIndex].id);
    }
  };

  const handleFanPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (fanCards.length === 0) return;
    const cardButton = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-card-id]");
    const cardId = cardButton?.dataset.cardId ?? null;
    const cardIndex = cardButton?.dataset.cardIndex ? Number(cardButton.dataset.cardIndex) : null;

    fanDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      cardId,
      cardIndex,
      mode: "idle",
    };
    fanDidDragRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleFanPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!fanDragRef.current) return;

    const deltaX = event.clientX - fanDragRef.current.x;
    const deltaY = event.clientY - fanDragRef.current.y;

    if (
      canChooseAnswer &&
      fanDragRef.current.cardId &&
      (fanDragRef.current.mode === "drag" || (deltaY < -24 && Math.abs(deltaY) > Math.abs(deltaX) * 0.72))
    ) {
      fanDragRef.current.mode = "drag";
      fanDidDragRef.current = true;

      const card = fanCards.find((item) => item.id === fanDragRef.current?.cardId);
      if (card) {
        // Throttle drag-ghost state updates to one per animation frame so we
        // don't trigger a React re-render on every pointer move event (60 fps).
        pendingDragPosRef.current = { card, x: event.clientX, y: event.clientY };
        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(() => {
            if (pendingDragPosRef.current) {
              setDraggingCard(pendingDragPosRef.current);
            }
            rafIdRef.current = null;
          });
        }
      }

      event.preventDefault();
      return;
    }

    if (Math.abs(deltaX) < 34 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) {
      return;
    }

    fanDragRef.current.mode = "swipe";
    fanDidDragRef.current = true;
    snapFanToIndex(activeCardIndex + (deltaX < 0 ? 1 : -1));
    fanDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      cardId: fanDragRef.current.cardId,
      cardIndex: fanDragRef.current.cardIndex,
      mode: "swipe",
    };
    event.preventDefault();
  };

  const handleFanPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = fanDragRef.current;

    // Cancel any pending RAF drag-ghost update.
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingDragPosRef.current = null;

    if (dragState?.pointerId === event.pointerId) {
      const tableRect = tableDropRef.current?.getBoundingClientRect();
      const droppedOnTable = !!tableRect
        && event.clientX >= tableRect.left
        && event.clientX <= tableRect.right
        && event.clientY >= tableRect.top
        && event.clientY <= tableRect.bottom;

      if (dragState.mode === "drag" && dragState.cardId && droppedOnTable) {
        submitCard(dragState.cardId);
      }

      fanDragRef.current = null;
    }

    setDraggingCard(null);

    window.setTimeout(() => {
      fanDidDragRef.current = false;
    }, 0);
  };

  return (
    <div className={cn("app-shell game-native-shell", s.gameReferenceShell)}>
      <main className={s.gameReferenceScreen}>
        <header className={s.referenceNav}>
          <Button variant="surface" size="icon" className={s.referenceNavButton} onClick={onReturnToLobby} aria-label="ლობის დაბრუნება">
            <LogOut className="h-5 w-5" />
          </Button>

          {showTimer && (
            <div className={cn(s.referenceTimerPill, secondsLeft !== null && secondsLeft <= 10 && s.referenceTimerPillUrgent)}>
              <Clock className="h-4 w-4" />
              <span>{secondsLeft}</span>
            </div>
          )}

          <Badge variant={isJudge ? "secondary" : "primary"} className={s.referenceRolePill}>
            {isJudge ? <Gavel /> : <Users />}
            {roleLabel}
          </Badge>
        </header>

        <section className={s.referenceStatusGrid} aria-label="თამაშის სტატუსი">
          <div className={cn(s.referenceStatusCard, s.referenceStatusCardRight)}>
            <h2 className={s.referenceRoundText}>რაუნდი {gameState.round_number} / {gameState.max_rounds}</h2>
            <Progress value={roundProgress} className={s.referenceProgress} />
          </div>
        </section>

        <section className={s.referencePlayArea} aria-label="მთავარი სათამაშო მაგიდა">
          <article className={s.referenceQuestionCard}>
            <p className={s.referenceQuestionText}>{inboxCard.text_ge}</p>
          </article>

          <div
            ref={tableDropRef}
            className={cn(s.referenceTablePerspective, canChooseAnswer && s.referenceTablePerspectiveDroppable)}
            aria-label="ბარათის დასადები მაგიდა"
          >
            <div className={s.referenceTableFelt} />

            {isJudge && gameState.phase === "submitting" && (
              <div className={s.referenceTableJudgeWait}>
                <Trophy className={s.referenceTableJudgeWaitIcon} />
                <p className={s.referenceTableJudgeWaitTitle}>ბარათები იგზავნება</p>
                <span className={s.referenceTableJudgeWaitCount}>
                  გაგზავნილია {submissions.length} / {activeComedians.length}
                </span>
              </div>
            )}

            <div className={s.referenceTableCardLayer}>
              {tableCards.map((submission, index) => {
                const cardText = submission.custom_text ?? submission.cards?.text_ge;
                const canPickWinner = canJudgeCards;

                return (
                  <button
                    type="button"
                    key={submission.id}
                    className={cn(
                      s.referenceTableCard,
                      canPickWinner && s.referenceTableCardPickable,
                    )}
                    style={{
                      ...getTableCardStyle(index, tableCards.length),
                      // Stagger the flip only while revealing; a fresh judging
                      // mount (e.g. a refresh) reveals all cards together.
                      "--reveal-delay": `${phase === "revealing" ? index * REVEAL_PER_CARD_MS : 0}ms`,
                    } as CSSProperties}
                    disabled={!canPickWinner}
                    onClick={() => canPickWinner && setPreviewSubmission(submission)}
                  >
                    <div
                      className={cn(
                        s.referenceTableCardFlipper,
                        revealActive && s.referenceTableCardFlipperRevealed,
                      )}
                    >
                      <div className={cn(s.referenceTableCardFace, s.referenceTableCardFaceBack)}>
                        <span className={s.referenceTableCardBackMark}>?</span>
                      </div>
                      <div className={cn(s.referenceTableCardFace, s.referenceTableCardFaceFront)}>
                        <span>{cardText}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className={s.referenceScoreTab}
            aria-label="ქულების დაფის გახსნა"
            aria-expanded={isScoreboardOpen}
            onClick={() => setIsScoreboardOpen(true)}
          >
            <Trophy className="h-6 w-14" />
          </button>

          <div
            className={s.referenceAnswerFan}
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

                const isBlank = card.is_blank;

                return (
                  <button
                    type="button"
                    key={card.id}
                    data-card-id={card.id}
                    data-card-index={index}
                    className={cn(
                      s.referenceAnswerCard,
                      isActive ? s.referenceAnswerCardActive : s.referenceAnswerCardSide,
                      isBlank && s.referenceAnswerCardBlank,
                    )}
                    style={getFanCardStyle(index)}
                    aria-pressed={isPressed}
                    onClick={() => handleFanCardClick(card, index)}
                    onKeyDown={(event) => {
                      if (canChooseAnswer && isActive && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        submitCard(card.id);
                      }
                    }}
                  >
                    {isBlank && (
                      <div className={s.referenceAnswerHead}>
                        <span className={s.referenceAnswerIcon}>
                          <Pencil className="h-4 w-4" />
                        </span>
                      </div>
                    )}
                    <span className={s.referenceAnswerText}>
                      <span className={s.referenceAnswerInner}>{card.text_ge}</span>
                    </span>
                  </button>
                );
              })
            ) : !isJudge ? (
              <div className={s.referenceStateMessage}>
                {gameState.phase === "submitting" && hasSubmitted && (
                  <>
                    <Send className="h-8 w-8 text-primary" />
                    <p>პასუხი გაგზავნილია</p>
                    <span>დაელოდე სხვა მოთამაშეებს</span>
                  </>
                )}

                {gameState.phase === "revealing" && (
                  <>
                    <MessageCircle className="h-8 w-8 text-primary" />
                    <p>ბარათები იხსნება</p>
                    <span>ნახე ვინ რა დადო</span>
                  </>
                )}

                {gameState.phase === "judging" && (
                  <>
                    <Users className="h-8 w-8 text-primary" />
                    <p>მსაჯული არჩევს</p>
                    <span>დაელოდეთ გადაწყვეტილებას</span>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </section>

        {/* Score overlay lives outside referencePlayArea so its z-[70] competes at the same level as nav (z-50) and status grid (z-40) */}
        <div
          className={cn(s.referenceScoreOverlay, isScoreboardOpen && s.referenceScoreOverlayOpen)}
          aria-hidden={!isScoreboardOpen}
        >
          <button
            type="button"
            className={s.referenceScoreBackdrop}
            aria-label="ქულების დაფის დახურვა"
            onClick={() => setIsScoreboardOpen(false)}
            tabIndex={isScoreboardOpen ? 0 : -1}
          />

          <aside className={s.referenceScorePanel} aria-label="ქულები">
            <div className={s.referenceScorePanelHead}>
              <div className={s.referenceScoreTitleWrap}>
                <div className={s.referenceScoreIcon}>
                  <Trophy className="h-5 w-5" />
                </div>
                <div>
                  <p className={s.referenceScoreKicker}>SCORE</p>
                  <h3 className={s.referenceScoreTitle}>ქულები</h3>
                </div>
              </div>

              <button
                type="button"
                className={s.referenceScoreClose}
                aria-label="ქულების დაფის დახურვა"
                onClick={() => setIsScoreboardOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {currentJudge && (
              <div className={s.referenceJudgeChip}>
                <Gavel className="h-4 w-4" />
                <span>{currentJudge.name}</span>
              </div>
            )}

            <div className={s.referenceScoreList}>
              {scorePlayers.map((player, index) => {
                const isLeader = !player.is_judge && scoreLeader?.id === player.id && player.score > 0;
                const isCurrentPlayer = player.id === currentPlayer.id;

                return (
                  <div
                    key={player.id}
                    className={cn(
                      s.referenceScoreRow,
                      isLeader && s.referenceScoreRowLeader,
                      isCurrentPlayer && s.referenceScoreRowCurrent,
                    )}
                  >
                    <div className={s.referenceScoreRank}>
                      {isLeader ? <Crown className="h-4 w-4" /> : index + 1}
                    </div>
                    <div className={s.referenceScoreName}>
                      <span>{player.name}</span>
                      {player.is_judge && <small>მსაჯული</small>}
                    </div>
                    <strong>{player.score}</strong>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>

        {/* Reaction dock — everyone can cheer during reveal / judging */}
        {showReactions && !isFinished && (
          <div className={s.referenceReactionDock}>
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={s.referenceReactionBtn}
                onClick={() => sendReaction(emoji)}
                aria-label={`რეაქცია ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Floating reactions */}
        <div className={s.referenceReactionFloatLayer} aria-hidden>
          {reactions.map((r) => (
            <span
              key={r.id}
              className={s.referenceReactionParticle}
              style={{ left: `${reactionX(r.id)}%` } as CSSProperties}
            >
              {r.emoji}
            </span>
          ))}
        </div>

        {previewSubmission && (
          <div
            className={s.cardPreviewOverlay}
            onClick={() => setPreviewSubmission(null)}
          >
            <div
              className={s.cardPreviewModal}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={s.cardPreviewCard}>
                <p className={s.cardPreviewText}>{previewSubmission.custom_text ?? previewSubmission.cards?.text_ge}</p>
              </div>
              <div className={s.cardPreviewActions}>
                <button
                  type="button"
                  className={s.cardPreviewCancel}
                  onClick={() => setPreviewSubmission(null)}
                >
                  გაუქმება
                </button>
                <button
                  type="button"
                  className={s.cardPreviewSelect}
                  disabled={isSelectingWinner}
                  onClick={() => {
                    void handleSelectWinner(previewSubmission.id);
                    setPreviewSubmission(null);
                  }}
                >
                  <Crown className="h-4 w-4" />
                  არჩევა
                </button>
              </div>
            </div>
          </div>
        )}

        {draggingCard && (
          <div
            className={s.referenceDragCard}
            style={{
              "--drag-x": `${draggingCard.x}px`,
              "--drag-y": `${draggingCard.y}px`,
            } as CSSProperties}
          >
            <span>{draggingCard.card.text_ge}</span>
          </div>
        )}

        {/* Blank-card composer */}
        {blankInput !== null && (
          <div className={s.cardPreviewOverlay} onClick={() => setBlankInput(null)}>
            <div className={s.blankComposer} onClick={(e) => e.stopPropagation()}>
              <div className={s.blankComposerHead}>
                <Pencil className="h-4 w-4" />
                <span>შენი პასუხი</span>
              </div>
              <textarea
                className={s.blankComposerInput}
                value={blankInput}
                onChange={(e) => setBlankInput(e.target.value)}
                maxLength={120}
                rows={3}
                autoFocus
                placeholder="დაწერე სასაცილო პასუხი..."
              />
              <div className={s.cardPreviewActions}>
                <button type="button" className={s.cardPreviewCancel} onClick={() => setBlankInput(null)}>
                  გაუქმება
                </button>
                <button
                  type="button"
                  className={s.cardPreviewSelect}
                  disabled={!blankInput.trim() || isSubmittingCard}
                  onClick={() => {
                    const text = blankInput;
                    setBlankInput(null);
                    void handleSubmitCard(BLANK_CARD_ID, text);
                  }}
                >
                  <Send className="h-4 w-4" />
                  გაგზავნა
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Round-winner celebration — auto-dismisses after a few seconds and
            never blocks input (pointer-events: none). Hidden once the final
            results overlay takes over. */}
        {roundWinner && !isFinished && (
          <div className={s.roundWinnerOverlay} aria-live="polite">
            <div className={s.roundWinnerPanel}>
              <div className={s.roundWinnerCrown}>
                <Crown className="h-7 w-7" />
              </div>
              <p className={s.roundWinnerKicker}>რაუნდის გამარჯვებული</p>
              <h3 className={s.roundWinnerName}>{roundWinner.name}</h3>
              {roundWinner.cardText && (
                <div className={s.roundWinnerCardText}>
                  <p>{roundWinner.cardText}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Results / rematch overlay */}
        {isFinished && (
          <div className={s.resultsOverlay}>
            <div className={s.resultsPanel}>
              <div className={s.resultsCrown}>
                <Trophy className="h-8 w-8" />
              </div>
              <p className={s.resultsKicker}>თამაში დასრულდა</p>
              <h2 className={s.resultsWinner}>{gameState.winner_name}</h2>
              <span className={s.resultsScore}>{gameState.winner_score} ქულა</span>

              <div className={s.resultsScores}>
                {scorePlayers.map((player, index) => (
                  <div
                    key={player.id}
                    className={cn(s.resultsRow, player.id === currentPlayer.id && s.resultsRowCurrent)}
                  >
                    <span className={s.resultsRank}>{index + 1}</span>
                    <span className={s.resultsName}>{player.name}</span>
                    <strong>{player.score}</strong>
                  </div>
                ))}
              </div>

              <div className={s.resultsActions}>
                {currentPlayerData?.is_host ? (
                  <>
                    <button type="button" className={s.resultsLobbyBtn} onClick={onEndToLobby}>
                      <Home className="h-4 w-4" />
                      ლობი
                    </button>
                    <button type="button" className={s.resultsRematchBtn} onClick={onRematch}>
                      <RotateCcw className="h-4 w-4" />
                      კიდევ ერთხელ
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className={s.resultsLobbyBtn} onClick={onReturnToLobby}>
                      <LogOut className="h-4 w-4" />
                      გასვლა
                    </button>
                    <div className={s.resultsWaitHint}>დაელოდე მასპინძელს...</div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );

};
export default GameBoard;
