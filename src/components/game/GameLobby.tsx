import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, ChevronDown, Copy, Crown, Gavel, LogOut, Minus, Play, Plus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PACKS } from "@/lib/gameConfig";

import { Player, Room } from "@/types/game";

interface GameLobbyProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  onStartGame: (maxRounds: number, pack: string | null) => void;
  onLeaveGame: () => void;
}

const GameLobby = ({ room, players, currentPlayer, onStartGame, onLeaveGame }: GameLobbyProps) => {
  const { toast } = useToast();
  const [maxRounds, setMaxRounds] = useState(5);
  const [pack, setPack] = useState<string | null>(null);
  const [packOpen, setPackOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);

  const canStart = players.length >= 3;
  const judge = players.find((p) => p.is_judge);
  const joinUrl = `${window.location.origin}/?pin=${room.pin}`;
  const currentPack = PACKS.find((p) => p.id === pack) ?? PACKS[0];

  const setRoundValue = (value: number) => setMaxRounds(Math.max(1, Math.min(10, value)));

  const copyRoomPin = () => {
    navigator.clipboard.writeText(room.pin);
    toast({ title: "კოდი დაკოპირდა", description: `PIN: ${room.pin}` });
  };

  const renderPlayerRow = (player: Player) => (
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
  );

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

        {/* ── PIN + QR + Stats ── */}
        <div className="surface-panel mt-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="label-text">PIN</p>
              <p className="mt-1 text-4xl font-black leading-none text-primary">{room.pin}</p>
              <button
                type="button"
                onClick={copyRoomPin}
                className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-text-muted transition-colors hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
                კოპირება
              </button>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="rounded-xl bg-white p-1.5 shadow-[0_8px_24px_hsl(160_45%_3%/0.4)]">
                <QRCodeSVG value={joinUrl} size={74} level="M" />
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wide text-text-muted">დაასკანერე</span>
            </div>
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

        {/* ── Players ── */}
        {currentPlayer.is_host ? (
          // Host has pack/rounds/CTA below, so the list collapses into a dropdown
          // to keep the layout clean. Raise the whole panel while open so the
          // dropdown stacks above the pack/rounds panels below it.
          <div className={cn("soft-panel mt-3 p-3", playersOpen && "relative z-[60]")}>
            <div className="relative">
              <button
                type="button"
                onClick={() => setPlayersOpen((o) => !o)}
                aria-expanded={playersOpen}
                className="flex w-full items-center gap-3"
              >
                <div className="icon-tile h-8 w-8 flex-shrink-0 rounded-xl text-secondary">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="label-text">players</p>
                  <h2 className="text-sm font-extrabold leading-tight">მოთამაშეები</h2>
                </div>
                <Badge variant={canStart ? "success" : "warning"}>
                  {canStart ? "ready" : `${3 - players.length} left`}
                </Badge>
                <span className="text-sm font-black">{players.length}/8</span>
                <ChevronDown
                  className={cn("h-4 w-4 flex-shrink-0 text-text-muted transition-transform", playersOpen && "rotate-180")}
                />
              </button>

              {playersOpen && (
                <>
                  <button
                    type="button"
                    aria-label="დახურვა"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setPlayersOpen(false)}
                  />
                  <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[15rem] space-y-2 overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.12] bg-[rgba(24,34,37,0.97)] p-2 shadow-[0_24px_60px_hsl(160_55%_3%/0.6)] backdrop-blur-2xl">
                    {players.map(renderPlayerRow)}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
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
              {players.map(renderPlayerRow)}
            </div>
          </div>
        )}

        {/* ── Pack picker (host only, compact dropdown) ── */}
        {currentPlayer.is_host && (
          <div className="soft-panel mt-3 p-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="label-text">setup</p>
                <h2 className="text-sm font-extrabold leading-tight">პაკეტი</h2>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPackOpen((o) => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={packOpen}
                  className="flex min-w-[9.5rem] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-left transition hover:bg-white/[0.1]"
                >
                  <span className="text-lg leading-none">{currentPack.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{currentPack.label}</span>
                    <span className="block truncate text-[10px] font-bold text-text-muted">{currentPack.hint}</span>
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 flex-shrink-0 text-text-muted transition-transform", packOpen && "rotate-180")}
                  />
                </button>

                {packOpen && (
                  <>
                    {/* click-away backdrop */}
                    <button
                      type="button"
                      aria-label="დახურვა"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setPackOpen(false)}
                    />
                    {/* opens upward so the bottom CTA never clips it */}
                    <div
                      role="listbox"
                      className="absolute bottom-full right-0 z-50 mb-2 w-[14rem] overflow-hidden rounded-2xl border border-white/[0.12] bg-[rgba(24,34,37,0.97)] p-1 shadow-[0_24px_60px_hsl(160_55%_3%/0.6)] backdrop-blur-2xl"
                    >
                      {PACKS.map((p) => (
                        <button
                          key={p.id ?? "classic"}
                          type="button"
                          role="option"
                          aria-selected={pack === p.id}
                          onClick={() => {
                            setPack(p.id);
                            setPackOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition",
                            pack === p.id ? "bg-primary/15" : "hover:bg-white/[0.07]"
                          )}
                        >
                          <span className="text-lg leading-none">{p.emoji}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black">{p.label}</span>
                            <span className="block truncate text-[10px] font-bold text-text-muted">{p.hint}</span>
                          </span>
                          {pack === p.id && <Check className="h-4 w-4 flex-shrink-0 text-primary" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

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

        {/* ── CTA (pinned to bottom) ── */}
        <div className="mt-auto pt-3">
          {currentPlayer.is_host ? (
            <Button onClick={() => onStartGame(maxRounds, pack)} disabled={!canStart} size="lg" className="h-14 w-full">
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
