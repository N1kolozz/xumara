import { useParams } from "react-router-dom";
import GameLobby from "@/components/game/GameLobby";
import GameBoard from "@/components/game/GameBoard";
import { useGameSession } from "@/hooks/useGameSession";
import { useGameActions } from "@/hooks/useGameActions";

const Game = () => {
  const { roomId } = useParams<{ roomId: string }>();

  const {
    room,
    setRoom,
    players,
    setPlayers,
    gameState,
    setGameState,
    currentPlayer,
    setCurrentPlayer,
    loading,
    onlinePlayerIds,
    presenceReady,
  } = useGameSession(roomId);

  const { handleStartGame, handleLeaveGame, handleReturnToLobby, handleRematch, handleEndToLobby } = useGameActions({
    room,
    currentPlayer,
    players,
    onlinePlayerIds,
    setRoom,
    setCurrentPlayer,
    setPlayers,
    setGameState,
  });

  if (loading || !room || !currentPlayer) {
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

  // Show lobby ONLY when room is in lobby status AND player is not in game
  // If player is in_game=true, they should see GameBoard regardless of room status
  const shouldShowLobby = room.status === "lobby" && !currentPlayer.in_game;

  return shouldShowLobby ? (
    <GameLobby
      room={room}
      players={players}
      currentPlayer={currentPlayer}
      onlinePlayerIds={onlinePlayerIds}
      presenceReady={presenceReady}
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
      onRematch={handleRematch}
      onEndToLobby={handleEndToLobby}
    />
  );
};

export default Game;
