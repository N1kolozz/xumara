import { useState } from "react";
import { Copy, Crown, Gavel, LogOut, Minus, Play, Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

import { Player, Room } from "@/types/game";

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

  const canStart = players.length >= 3;
  const judge = players.find((p) => p.is_judge);

  const setRoundValue = (value: number) => setMaxRounds(Math.max(1, Math.min(10, value)));

  const copyRoomPin = () => {
    navigator.clipboard.writeText(room.pin);
    toast({ title: "კოდი დაკოპირდა", description: `PIN: ${room.pin}` });
  };

  return (
    <div className="game-native-shell bg-background text-foreground">
      {/* ambient gradient */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "linear-gradient(115deg, hsl(var(--primary)/0.10), transparent 32%), linear-gradient(245deg, hsl(var(--accent)/0.09), transparent 34%), linear-gradient(180deg, transparent 0%, hsl(0 0% 0% / 0.22) 100%)",
        }}
      />

      <div
        className="relative z-10 mx-auto flex h-full max-w-md flex-col px-4"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        {/* ── Header ── */}
        <header className="flex items-center justify-between py-2">
          <Button variant="surface" size="icon" onClick={onLeaveGame} aria-label="ოთახიდან გასვლა">
            <LogOut className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <p className="label-text">lobby</p>
            <h1 className="text-xl font-black leading-tight">ოთახი მზადაა</h1>
          </div>
          <div className="icon-tile text-primary">
            <Users className="h-5 w-5" />
          </div>
        </header>

        {/* ── PIN + Stats ── */}
        <div className="surface-panel mt-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="label-text">PIN</p>
              <p className="mt-1 text-4xl font-black leading-none text-primary">{room.pin}</p>
            </div>
            <Button variant="outline" size="icon" onClick={copyRoomPin} aria-label="PIN კოდის დაკოპირება">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="game-stat">
              <p className="text-[10px] font-bold text-text-muted">Players</p>
              <p className="text-sm font-black">{players.length}/8</p>
            </div>
            <div className="game-stat">
              <p className="text-[10px] font-bold text-text-muted">Judge</p>
              <p className="truncate text-sm font-black">{judge?.name ?? "..."}</p>
            </div>
            <div className="game-stat">
              <p className="text-[10px] font-bold text-text-muted">Rounds</p>
              <p className="text-sm font-black">{maxRounds}</p>
            </div>
          </div>
        </div>

        {/* ── Players (flex-1, internal scroll only) ── */}
        <div className="soft-panel mt-3 flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="icon-tile h-8 w-8 rounded-xl text-secondary">
                <Users className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="label-text">players</p>
                <h2 className="text-sm font-extrabold leading-tight">მოთამაშეები</h2>
              </div>
            </div>
            <Badge variant={canStart ? "success" : "warning"}>
              {canStart ? "ready" : `${3 - players.length} left`}
            </Badge>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {players.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-primary/15 text-sm font-black text-primary">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{player.name}</p>
                    <p className="text-xs font-bold text-text-muted">
                      {player.id === currentPlayer.id ? "შენ" : "ონლაინ"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {player.is_host && (
                    <Badge variant="accent">
                      <Crown />
                      host
                    </Badge>
                  )}
                  {player.is_judge && (
                    <Badge variant="secondary">
                      <Gavel />
                      judge
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Rounds (host only, compact inline) ── */}
        {currentPlayer.is_host && (
          <div className="soft-panel mt-3 p-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="label-text">setup</p>
                <h2 className="text-sm font-extrabold leading-tight">რაუნდები</h2>
              </div>
              <Badge variant="primary">1-10</Badge>
              <div className="control-panel flex items-center gap-1 p-1">
                <Button
                  variant="surface"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setRoundValue(maxRounds - 1)}
                  disabled={maxRounds <= 1}
                  aria-label="შემცირება"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center text-lg font-black">{maxRounds}</span>
                <Button
                  variant="surface"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setRoundValue(maxRounds + 1)}
                  disabled={maxRounds >= 10}
                  aria-label="გაზრდა"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── CTA ── */}
        <div className="mt-3">
          {currentPlayer.is_host ? (
            <Button onClick={() => onStartGame(maxRounds)} disabled={!canStart} size="lg" className="h-14 w-full">
              <Play className="h-5 w-5" />
              {canStart ? `თამაშის დაწყება (${maxRounds})` : `დაელოდეთ ${3 - players.length} მოთამაშეს`}
            </Button>
          ) : (
            <div className="soft-panel p-4 text-center">
              <p className="text-base font-black">დაელოდეთ მასპინძელს</p>
              <p className="mt-0.5 text-xs font-semibold text-text-soft">
                თამაში დაიწყება როცა ყველა მზად იქნება
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameLobby;
