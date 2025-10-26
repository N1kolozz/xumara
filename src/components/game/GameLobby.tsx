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
const GameLobby = ({
  room,
  players,
  currentPlayer,
  onStartGame,
  onLeaveGame
}: GameLobbyProps) => {
  const {
    toast
  } = useToast();
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
      description: `PIN: ${room.pin}`
    });
  };
  return <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6 animate-slide-in">
        {/* Header */}
        <div className="text-center space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <Button variant="outline" onClick={onLeaveGame} className="h-9 sm:h-10 text-xs sm:text-sm touch-manipulation hover:bg-destructive hover:text-destructive-foreground">
              ← გასვლა
            </Button>
            <div className="flex-1" />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold gradient-text">Chat-ლახი</h1>
          
        </div>

        {/* Room Code */}
        <Card className="p-4 sm:p-6 bg-card/50 backdrop-blur-sm border-primary/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">ოთახის კოდი:</p>
              <p className="text-2xl sm:text-3xl font-bold text-primary tracking-wider">{room.pin}</p>
            </div>
            <Button variant="outline" size="icon" onClick={copyRoomPin} className="h-10 w-10 sm:h-12 sm:w-12 touch-manipulation hover:scale-110 transition-transform">
              <Copy className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </Card>

        {/* Players List */}
        <Card className="p-4 sm:p-6 bg-card/50 backdrop-blur-sm border-primary/20">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <h2 className="text-base sm:text-xl font-semibold">
              მოთამაშეები ({players.length}/8)
            </h2>
          </div>

          <div className="space-y-2">
            {players.map((player, index) => <div key={player.id} className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors" style={{
            animationDelay: `${index * 0.1}s`
          }}>
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-sm sm:text-base font-bold flex-shrink-0">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium text-sm sm:text-base truncate">{player.name}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  {player.is_host && <div className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-accent/20 text-accent text-xs sm:text-sm font-medium">
                      <Crown className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">მასპინძელი</span>
                    </div>}
                  {player.is_judge && <div className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-primary/20 text-primary text-xs sm:text-sm font-medium">
                      <Gavel className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">მსაჯული</span>
                    </div>}
                </div>
              </div>)}
          </div>

          {players.length < 3 && <p className="text-xs sm:text-sm text-muted-foreground mt-3 sm:mt-4 text-center">
              დაელოდეთ კიდევ {3 - players.length} მოთამაშეს თამაშის დასაწყებად
            </p>}
        </Card>

        {/* Rounds Selection - Only for host */}
        {currentPlayer.is_host && <Card className="p-4 sm:p-6 bg-card/50 backdrop-blur-sm border-primary/20">
            <div className="space-y-3">
              <label className="text-xs sm:text-sm font-medium text-foreground">
                რაუნდების რაოდენობა:
              </label>
              <Input type="number" min={1} max={10} value={maxRounds} onChange={e => {
            const value = parseInt(e.target.value) || 1;
            if (value > 10) {
              setRoundsError("თქვენ ვერ შეძლებთ 10-ზე მეტი რაუნდის არჩევას");
              setMaxRounds(10);
            } else {
              setRoundsError("");
              setMaxRounds(Math.max(1, value));
            }
          }} className="text-center text-lg sm:text-xl font-bold h-12 sm:h-14 touch-manipulation" />
              <p className="text-xs text-muted-foreground text-center">
                აირჩიეთ 1-დან 10-მდე რაუნდი
              </p>
              {roundsError && <p className="text-xs text-destructive text-center font-medium">
                  {roundsError}
                </p>}
            </div>
          </Card>}

        {/* Start Button - Always visible for host */}
        <div className="space-y-3">
          {currentPlayer.is_host ? <>
              <Button onClick={() => {
            console.log("Start game button clicked!");
            console.log("Players:", players);
            const validatedRounds = Math.min(10, Math.max(1, maxRounds));
            console.log("Max rounds:", validatedRounds);
            onStartGame(validatedRounds);
          }} disabled={players.length < 3} className="w-full h-12 sm:h-14 md:h-16 text-base sm:text-lg md:text-xl font-bold shadow-xl touch-manipulation">
                {players.length < 3 ? `დაელოდეთ კიდევ ${3 - players.length} მოთამაშეს...` : `თამაშის დაწყება (${maxRounds} რაუნდი)`}
              </Button>
            </> : <div className="text-center py-6 sm:py-8 space-y-2">
              <div className="text-3xl sm:text-4xl mb-2">⏳</div>
              <p className="text-base sm:text-lg font-medium px-4">
                დაელოდეთ რომ მასპინძელმა დაიწყოს თამაში...
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                მასპინძელი: {players.find(p => p.is_host)?.name}
              </p>
            </div>}
        </div>
      </div>
    </div>;
};
export default GameLobby;