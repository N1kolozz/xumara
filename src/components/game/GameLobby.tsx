import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Users, Copy, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Player {
  id: string;
  name: string;
  is_host: boolean;
}

interface Room {
  id: string;
  pin: string;
}

interface GameLobbyProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  onStartGame: () => void;
}

const GameLobby = ({ room, players, currentPlayer, onStartGame }: GameLobbyProps) => {
  const { toast } = useToast();

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
                {player.is_host && (
                  <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-accent/20 text-accent text-sm font-medium">
                    <Crown className="h-4 w-4" />
                    <span>მასპინძელი</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {players.length < 3 && (
            <p className="text-sm text-muted-foreground mt-4 text-center">
              დაელოდეთ კიდევ {3 - players.length} მოთამაშეს თამაშის დასაწყებად
            </p>
          )}
        </Card>

        {/* Start Button */}
        {currentPlayer.is_host && (
          <Button
            onClick={onStartGame}
            disabled={players.length < 3}
            className="w-full h-14 text-lg font-bold bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity glow-effect"
          >
            {players.length < 3 ? "დაელოდეთ მეტ მოთამაშეს" : "თამაშის დაწყება 🎮"}
          </Button>
        )}

        {!currentPlayer.is_host && (
          <div className="text-center py-4">
            <p className="text-muted-foreground">
              დაელოდეთ რომ მასპინძელმა დაიწყოს თამაში...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameLobby;
