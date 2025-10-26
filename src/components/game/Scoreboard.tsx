import { Card } from "@/components/ui/card";
import { Trophy } from "lucide-react";

interface Player {
  id: string;
  name: string;
  score: number;
  is_judge: boolean;
}

interface ScoreboardProps {
  players: Player[];
}

const Scoreboard = ({ players }: ScoreboardProps) => {
  // Separate judge from regular players
  const judge = players.find(p => p.is_judge);
  const regularPlayers = players.filter(p => !p.is_judge);
  const sortedPlayers = [...regularPlayers].sort((a, b) => b.score - a.score);

  return (
    <Card className="p-4 bg-card/50 backdrop-blur-sm border-primary/20">
      {/* Judge Section */}
      {judge && (
        <div className="mb-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">მსაჯული:</span>
            <span className="font-semibold text-accent">{judge.name}</span>
          </div>
        </div>
      )}

      {/* Scoreboard Section */}
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-5 w-5 text-accent" />
        <h3 className="font-semibold">ქულები</h3>
      </div>

      <div className="space-y-2 min-w-[200px]">
        {sortedPlayers.map((player, index) => (
          <div
            key={player.id}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">#{index + 1}</span>
              <span className="font-medium truncate max-w-[120px]">
                {player.name}
              </span>
            </div>
            <span className="font-bold text-primary">{player.score}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default Scoreboard;
