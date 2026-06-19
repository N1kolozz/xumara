import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Crown, Gavel, Info, LogOut, Minus, Play, Plus, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { InfoModal } from "@/components/home/InfoModal";

import { Player, Room } from "@/types/game";

interface GameLobbyProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  onlinePlayerIds: string[];
  presenceReady: boolean;
  onStartGame: (maxRounds: number, pack: string | null) => void;
  onLeaveGame: () => void;
}

const GameLobby = ({ room, players, currentPlayer, onlinePlayerIds, presenceReady, onStartGame, onLeaveGame }: GameLobbyProps) => {
  const { toast } = useToast();
  const [maxRounds, setMaxRounds] = useState(5);
  const [showInfo, setShowInfo] = useState(false);

  // Show only players still connected to the room (Realtime Presence). A player
  // who closes their tab drops out within seconds, so everyone else sees them
  // leave in real time instead of a stale row lingering until the DB prune.
  // Before presence has synced (empty list) fall back to the full DB list, and
  // always keep ourselves visible.
  const onlineSet = new Set(onlinePlayerIds);
  const visiblePlayers =
    onlineSet.size === 0
      ? players
      : players.filter((p) => onlineSet.has(p.id) || p.id === currentPlayer.id);

  // Gate readiness on presence too, so we never flash "ready" off a stale list.
  const canStart = presenceReady && visiblePlayers.length >= 3;
  const joinUrl = `${window.location.origin}/?pin=${room.pin}`;

  const setRoundValue = (value: number) => setMaxRounds(Math.max(1, Math.min(10, value)));

  const copyRoomPin = () => {
    navigator.clipboard.writeText(room.pin);
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
          <Button
            variant="surface"
            size="icon"
            className="text-primary"
            onClick={() => setShowInfo(true)}
            aria-label="ინფორმაცია"
          >
            <Info className="h-5 w-5" />
          </Button>
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
        </div>

        {/* ── Players ── */}
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
              {!presenceReady ? "..." : canStart ? "ready" : `${3 - visiblePlayers.length} left`}
            </Badge>
          </div>

          <div className="no-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto">
            {!presenceReady ? (
              <div className="flex h-full items-center justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
              </div>
            ) : (
              visiblePlayers.map(renderPlayerRow)
            )}
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

        {/* ── CTA (pinned to bottom) ── */}
        <div className="mt-auto pt-3">
          {currentPlayer.is_host ? (
            <Button onClick={() => onStartGame(maxRounds, null)} disabled={!canStart} size="lg" className="h-14 w-full">
              <Play className="h-5 w-5" />
              {canStart ? `თამაშის დაწყება (${maxRounds})` : `დაელოდეთ ${3 - visiblePlayers.length} მოთამაშეს`}
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

      {/* ── Info / how-to-play (same content as the home screen) ── */}
      {showInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowInfo(false);
          }}
        >
          <div className="surface-panel flex max-h-[82%] w-full max-w-md flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="icon-tile text-primary">
                  <Info className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="label-text">ინფორმაცია</p>
                  <h2 className="truncate text-base font-black leading-tight">როგორ ვითამაშოთ</h2>
                </div>
              </div>
              <Button
                variant="surface"
                size="icon"
                onClick={() => setShowInfo(false)}
                aria-label="დახურვა"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="no-scrollbar overflow-y-auto p-4">
              <InfoModal />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameLobby;
