import { useEffect, useState } from "react";
import { Crown, Gavel, Trophy } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface Player {
  id: string;
  name: string;
  score: number;
  is_judge: boolean;
  in_game: boolean;
}

interface ScoreboardProps {
  players: Player[];
  roomId: string;
}

const Scoreboard = ({ players: initialPlayers, roomId }: ScoreboardProps) => {
  const [players, setPlayers] = useState<Player[]>(initialPlayers);

  useEffect(() => {
    setPlayers(initialPlayers);
  }, [initialPlayers]);

  useEffect(() => {
    const channel = supabase
      .channel(`scoreboard_${roomId}`, {
        config: {
          broadcast: { self: true },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const { data } = await supabase
            .from("players")
            .select("id, name, score, is_judge, in_game")
            .eq("room_id", roomId)
            .eq("in_game", true)
            .order("joined_at", { ascending: true });

          if (data) {
            setPlayers(data);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const judge = players.find((player) => player.is_judge);
  const sortedPlayers = players.filter((player) => !player.is_judge).sort((a, b) => b.score - a.score);
  const leaderScore = sortedPlayers[0]?.score ?? 0;

  return (
    <aside className="soft-panel p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="icon-tile h-9 w-9 rounded-xl text-accent">
            <Trophy className="h-4 w-4" />
          </div>
          <div>
            <p className="label-text">score</p>
            <h3 className="section-title">ქულები</h3>
          </div>
        </div>
        {judge && (
          <Badge variant="secondary" className="max-w-[130px] truncate">
            <Gavel />
            {judge.name}
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        {sortedPlayers.map((player, index) => {
          const isLeader = player.score === leaderScore && leaderScore > 0;

          return (
            <div
              key={player.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-white/[0.07] text-xs font-black text-text-soft">
                  {isLeader ? <Crown className="h-4 w-4 text-accent" /> : index + 1}
                </div>
                <span className="truncate text-sm font-extrabold text-foreground">{player.name}</span>
              </div>
              <span className="min-w-8 rounded-lg bg-primary/15 px-2 py-1 text-center text-sm font-black text-primary">
                {player.score}
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default Scoreboard;
