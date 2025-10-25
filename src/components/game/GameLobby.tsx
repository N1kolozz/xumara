import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Users, Copy, Crown, Gavel, Gamepad2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Player {
  id: string;
  name: string;
  is_host: boolean;
  is_judge: boolean;
}

interface Room {
  id: string;
  pin: string;
}

interface GameLobbyProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  onStartGame: (maxRounds: number) => void;
  onLeaveGame: () => void;
}

const GameLobby = ({ room, players, currentPlayer, onStartGame, onLeaveGame }: GameLobbyProps) => {
  const { toast } = useToast();
  const [maxRounds, setMaxRounds] = useState(5);
  const [roundsError, setRoundsError] = useState("");

  // Debug logging
  console.log("GameLobby - Current Player:", currentPlayer);
  console.log("GameLobby - Is Host:", currentPlayer.is_host);
  console.log("GameLobby - Players Count:", players.length);

  const copyRoomPin = () => {
    navigator.clipboard.writeText(room.pin);
    toast({
      title: "კოდი დაკოპირდა!",
      description: `PIN: ${room.pin}`,
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6 animate-slide-in">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              onClick={onLeaveGame}
              className="hover:bg-destructive hover:text-destructive-foreground"
            >
              ← გასვლა
            </Button>
            <div className="flex-1" />
          </div>
          <h1 className="text-5xl font-bold gradient-text">Chat-ლახი</h1>
          <p className="text-xl text-muted-foreground">მოთამაშეები რომლებიც ელოდებიან თამაშის დაწყებას</p>
        </div>

        {/* Room Code */}
        <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">ოთახის კოდი:</p>
              <p className="text-3xl font-bold text-primary tracking-wider">{room.pin}</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={copyRoomPin}
              className="h-12 w-12 hover:scale-110 transition-transform"
            >
              <Copy className="h-5 w-5" />
            </Button>
          </div>
        </Card>

        {/* Players List */}
        <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">
              მოთამაშეები ({players.length}/8)
            </h2>
          </div>

          <div className="space-y-2">
            {players.map((player, index) => (
              <div
                key={player.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium">{player.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {player.is_host && (
                    <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-accent/20 text-accent text-sm font-medium">
                      <Crown className="h-4 w-4" />
                      <span className="hidden md:inline">მასპინძელი</span>
                    </div>
                  )}
                  {player.is_judge && (
                    <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium">
                      <Gavel className="h-4 w-4" />
                      <span className="hidden md:inline">მსაჯული</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {players.length < 3 && (
            <p className="text-sm text-muted-foreground mt-4 text-center">
              დაელოდეთ კიდევ {3 - players.length} მოთამაშეს თამაშის დასაწყებად
            </p>
          )}
        </Card>

        {/* Rounds Selection - Only for host */}
        {currentPlayer.is_host && (
          <Card className="p-6 bg-card/50 backdrop-blur-sm border-primary/20">
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">
                რაუნდების რაოდენობა:
              </label>
              <Input
                type="number"
                min={1}
                max={10}
                value={maxRounds}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 1;
                  if (value > 10) {
                    setRoundsError("თქვენ ვერ შეძლებთ 10-ზე მეტი რაუნდის არჩევას");
                    setMaxRounds(10);
                  } else {
                    setRoundsError("");
                    setMaxRounds(Math.max(1, value));
                  }
                }}
                className="text-center text-xl font-bold"
              />
              <p className="text-xs text-muted-foreground text-center">
                აირჩიეთ 1-დან 10-მდე რაუნდი
              </p>
              {roundsError && (
                <p className="text-xs text-destructive text-center font-medium">
                  {roundsError}
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Start Button - Always visible for host */}
        <div className="space-y-3">
          {currentPlayer.is_host ? (
            <>
              <Button
                onClick={() => {
                  console.log("Start game button clicked!");
                  console.log("Players:", players);
                  const validatedRounds = Math.min(10, Math.max(1, maxRounds));
                  console.log("Max rounds:", validatedRounds);
                  onStartGame(validatedRounds);
                }}
                disabled={players.length < 3}
                className="w-full h-16 text-xl font-bold shadow-xl"
              >
                {players.length < 3 
                  ? `დაელოდეთ კიდევ ${3 - players.length} მოთამაშეს...` 
                  : `თამაშის დაწყება (${maxRounds} რაუნდი)`}
              </Button>
            </>
          ) : (
            <div className="text-center py-8 space-y-2">
              <div className="text-4xl mb-2">⏳</div>
              <p className="text-lg font-medium">
                დაელოდეთ რომ მასპინძელმა დაიწყოს თამაში...
              </p>
              <p className="text-sm text-muted-foreground">
                მასპინძელი: {players.find(p => p.is_host)?.name}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameLobby;
