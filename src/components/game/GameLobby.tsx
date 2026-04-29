import { useState } from "react";
import { Copy, Crown, Gavel, LogOut, Minus, Play, Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [maxRounds, setMaxRounds] = useState<number | "">(5);

  const rounds = Number(maxRounds) || 1;
  const canStart = players.length >= 3;
  const judge = players.find((player) => player.is_judge);

  const setRoundValue = (value: number) => {
    setMaxRounds(Math.max(1, Math.min(10, value)));
  };

  const copyRoomPin = () => {
    navigator.clipboard.writeText(room.pin);
    toast({
      title: "კოდი დაკოპირდა",
      description: `PIN: ${room.pin}`,
    });
  };

  return (
    <div className="app-shell">
      <main className="screen safe-bottom gap-5">
        <header className="game-topbar">
          <Button variant="surface" size="icon" onClick={onLeaveGame} aria-label="ოთახიდან გასვლა">
            <LogOut className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <p className="label-text">lobby</p>
            <h1 className="screen-title">ოთახი მზადაა</h1>
          </div>
          <div className="icon-tile text-primary">
            <Users className="h-5 w-5" />
          </div>
        </header>

        <section className="surface-panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="label-text">PIN</p>
              <p className="mt-1 text-4xl font-black leading-none text-primary">{room.pin}</p>
            </div>
            <Button variant="outline" size="icon" onClick={copyRoomPin} aria-label="PIN კოდის დაკოპირება">
              <Copy className="h-5 w-5" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="game-stat">
              <p className="text-[11px] font-bold text-text-muted">Players</p>
              <p className="text-sm font-black">{players.length}/8</p>
            </div>
            <div className="game-stat">
              <p className="text-[11px] font-bold text-text-muted">Judge</p>
              <p className="truncate text-sm font-black">{judge?.name ?? "..."}</p>
            </div>
            <div className="game-stat">
              <p className="text-[11px] font-bold text-text-muted">Rounds</p>
              <p className="text-sm font-black">{rounds}</p>
            </div>
          </div>
        </section>

        <section className="soft-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="icon-tile h-9 w-9 rounded-xl text-secondary">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className="label-text">players</p>
                <h2 className="section-title">მოთამაშეები</h2>
              </div>
            </div>
            <Badge variant={canStart ? "success" : "warning"}>{canStart ? "ready" : `${3 - players.length} left`}</Badge>
          </div>

          <div className="space-y-2">
            {players.map((player) => (
              <div key={player.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-primary/15 text-base font-black text-primary">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-foreground">{player.name}</p>
                    <p className="text-xs font-bold text-text-muted">{player.id === currentPlayer.id ? "შენ" : "ონლაინ"}</p>
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
        </section>

        {currentPlayer.is_host && (
          <section className="soft-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="label-text">setup</p>
                <h2 className="section-title">რაუნდები</h2>
              </div>
              <Badge variant="primary">1-10</Badge>
            </div>

            <div className="control-panel grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
              <Button variant="surface" size="icon" onClick={() => setRoundValue(rounds - 1)} disabled={rounds <= 1} aria-label="რაუნდების შემცირება">
                <Minus className="h-5 w-5" />
              </Button>
              <Input
                type="number"
                value={maxRounds}
                onChange={(event) => {
                  const value = event.target.value === "" ? "" : parseInt(event.target.value);
                  setMaxRounds(value);
                }}
                min={1}
                max={10}
                className="border-0 bg-transparent text-center text-2xl font-black shadow-none focus:bg-transparent"
                aria-label="რაუნდების რაოდენობა"
              />
              <Button variant="surface" size="icon" onClick={() => setRoundValue(rounds + 1)} disabled={rounds >= 10} aria-label="რაუნდების გაზრდა">
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </section>
        )}

        <div className="mt-auto">
          {currentPlayer.is_host ? (
            <Button
              onClick={() => {
                if (!rounds || rounds < 1 || rounds > 10) {
                  toast({
                    title: "შეცდომა",
                    description: "რაუნდების რაოდენობა უნდა იყოს 1-დან 10-მდე",
                    variant: "destructive",
                  });
                  return;
                }

                onStartGame(rounds);
              }}
              disabled={!canStart}
              size="lg"
              className="h-14 w-full"
            >
              <Play className="h-5 w-5" />
              {canStart ? `თამაშის დაწყება (${rounds})` : `დაელოდეთ ${3 - players.length} მოთამაშეს`}
            </Button>
          ) : (
            <div className="soft-panel p-4 text-center">
              <p className="text-lg font-black text-foreground">დაელოდეთ მასპინძელს</p>
              <p className="mt-1 text-sm font-semibold text-text-soft">თამაში დაიწყება როცა ყველა მზად იქნება</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default GameLobby;
