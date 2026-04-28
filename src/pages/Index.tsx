import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Gamepad2, Gavel, Laugh, LogIn, Plus, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Role = "player" | "judge";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [createPlayerName, setCreatePlayerName] = useState("");
  const [joinPlayerName, setJoinPlayerName] = useState("");
  const [roomPin, setRoomPin] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [createRole, setCreateRole] = useState<Role | null>(null);
  const [joinRole, setJoinRole] = useState<Role | null>(null);
  const [showRoleError, setShowRoleError] = useState(false);

  const generatePin = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const getOrCreateGuestUser = async () => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) throw sessionError;
    if (session?.user) return session.user;

    const {
      data: { user },
      error: signInError,
    } = await supabase.auth.signInAnonymously();

    if (signInError) {
      throw new Error(`Supabase anonymous auth failed: ${signInError.message}`);
    }

    if (!user) {
      throw new Error("Supabase anonymous auth did not return a user.");
    }

    return user;
  };

  const getErrorMessage = (error: unknown) => {
    return error instanceof Error ? error.message : "Unknown Supabase error";
  };

  const createRoom = async () => {
    if (!createPlayerName.trim()) {
      toast({
        title: "შეიყვანეთ სახელი",
        description: "თამაშის დასაწყებად სახელი აუცილებელია",
        variant: "destructive",
      });
      return;
    }

    if (!createRole) {
      toast({
        title: "აირჩიეთ როლი",
        description: "თამაშის დასაწყებად როლის არჩევა აუცილებელია",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const user = await getOrCreateGuestUser();
      let room = null;
      let attempts = 0;
      const maxAttempts = 5;

      while (!room && attempts < maxAttempts) {
        attempts++;
        const pin = generatePin();
        const { data: roomData, error: roomError } = await supabase
          .from("rooms")
          .insert({
            pin,
            status: "lobby",
          })
          .select()
          .single();

        if (roomError && roomError.code === "23505") {
          continue;
        }

        if (roomError) throw roomError;
        room = roomData;
      }

      if (!room) {
        throw new Error("Failed to generate unique PIN after multiple attempts");
      }

      const { data: player, error: playerError } = await supabase
        .from("players")
        .insert({
          room_id: room.id,
          name: createPlayerName,
          is_host: true,
          is_judge: createRole === "judge",
          user_id: user.id,
        })
        .select()
        .single();

      if (playerError) throw playerError;

      sessionStorage.setItem(`player_${room.id}`, player.id);
      localStorage.setItem(`player_${room.id}`, player.id);
      await supabase.from("rooms").update({ host_id: player.id }).eq("id", room.id);

      toast({
        title: "ოთახი შეიქმნა",
        description: `PIN: ${room.pin}`,
      });
      navigate(`/game/${room.id}`);
    } catch (error) {
      console.error("Failed to create room:", error);
      toast({
        title: "შეცდომა",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const joinRoom = async () => {
    if (!joinPlayerName.trim() || !roomPin.trim()) {
      toast({
        title: "შეავსეთ ყველა ველი",
        description: "სახელი და PIN აუცილებელია",
        variant: "destructive",
      });
      return;
    }

    if (!joinRole) {
      toast({
        title: "აირჩიეთ როლი",
        description: "თამაშში შესასვლელად როლის არჩევა აუცილებელია",
        variant: "destructive",
      });
      return;
    }

    setIsJoining(true);
    setShowRoleError(false);
    try {
      const user = await getOrCreateGuestUser();
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("pin", roomPin.toUpperCase())
        .single();

      if (roomError || !room) {
        toast({
          title: "ოთახი ვერ მოიძებნა",
          description: "შეამოწმეთ PIN და სცადეთ ხელახლა",
          variant: "destructive",
        });
        return;
      }

      if (room.status !== "lobby") {
        toast({
          title: "თამაში უკვე დაწყებულია",
          description: "ამ ოთახში შესვლა შეუძლებელია",
          variant: "destructive",
        });
        return;
      }

      const { data: existingPlayers } = await supabase.from("players").select("*").eq("room_id", room.id);

      if (existingPlayers && existingPlayers.length >= 8) {
        toast({
          title: "ოთახი სავსეა",
          description: "ამ ოთახში მეტი მოთამაშე ვეღარ დაემატება",
          variant: "destructive",
        });
        return;
      }

      if (joinRole === "judge") {
        const existingJudge = existingPlayers?.find((player) => player.is_judge);
        if (existingJudge) {
          setShowRoleError(true);
          setIsJoining(false);
          return;
        }
      }

      const { data: player, error: playerError } = await supabase
        .from("players")
        .insert({
          room_id: room.id,
          name: joinPlayerName,
          is_host: false,
          is_judge: joinRole === "judge",
          user_id: user.id,
        })
        .select()
        .single();

      if (playerError) throw playerError;

      sessionStorage.setItem(`player_${room.id}`, player.id);
      localStorage.setItem(`player_${room.id}`, player.id);

      toast({
        title: "წარმატებით შეუერთდით",
        description: `ოთახი: ${room.pin}`,
      });
      navigate(`/game/${room.id}`);
    } catch (error) {
      console.error("Failed to join room:", error);
      toast({
        title: "შეცდომა",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsJoining(false);
    }
  };

  const roleButtonClass = (active: boolean, tone: "primary" | "accent") =>
    cn(
      "role-button inline-flex items-center justify-center gap-2",
      active && (tone === "primary" ? "role-button-active-primary" : "role-button-active-accent"),
    );

  return (
    <div className="app-shell">
      <main className="screen safe-bottom gap-5">
        <header className="game-topbar">
          <div className="brand-lockup">
            <p className="label-text">party game</p>
            <h1 className="brand-mark">ხუმარა</h1>
            <p className="brand-subtitle">წაიხუმრე შენებურად</p>
          </div>
          <div className="icon-tile h-12 w-12 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
        </header>

        <section className="grid grid-cols-3 gap-2">
          <div className="game-stat">
            <p className="text-[11px] font-bold text-text-muted">Players</p>
            <p className="text-sm font-black text-foreground">3-8</p>
          </div>
          <div className="game-stat">
            <p className="text-[11px] font-bold text-text-muted">Mode</p>
            <p className="text-sm font-black text-foreground">Online</p>
          </div>
          <div className="game-stat">
            <p className="text-[11px] font-bold text-text-muted">Round</p>
            <p className="text-sm font-black text-foreground">1-10</p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card className="p-4 sm:p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <Badge variant="primary" className="mb-3">
                  <Plus />
                  ახალი
                </Badge>
                <h2 className="screen-title text-xl sm:text-2xl">შექმენი ოთახი</h2>
                <p className="body-text mt-1">მოიწვიე მეგობრები PIN-ით</p>
              </div>
              <div className="icon-tile text-primary">
                <Users className="h-5 w-5" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="label-text" htmlFor="create-name">
                  სახელი
                </label>
                <Input
                  id="create-name"
                  placeholder="შენი სახელი"
                  value={createPlayerName}
                  onChange={(event) => setCreatePlayerName(event.target.value)}
                  maxLength={20}
                />
              </div>

              <div className="space-y-2">
                <p className="label-text">როლი</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={createRole === "player"}
                    onClick={() => setCreateRole("player")}
                    className={roleButtonClass(createRole === "player", "primary")}
                  >
                    <Laugh className="h-4 w-4" />
                    ხუმარა
                  </button>
                  <button
                    type="button"
                    aria-pressed={createRole === "judge"}
                    onClick={() => setCreateRole("judge")}
                    className={roleButtonClass(createRole === "judge", "primary")}
                  >
                    <Gavel className="h-4 w-4" />
                    მსაჯული
                  </button>
                </div>
              </div>

              <Button onClick={createRoom} disabled={isCreating} size="lg" className="w-full">
                {isCreating ? "იქმნება..." : "ოთახის შექმნა"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <Badge variant="accent" className="mb-3">
                  <LogIn />
                  შესვლა
                </Badge>
                <h2 className="screen-title text-xl sm:text-2xl">შეუერთდი ოთახს</h2>
                <p className="body-text mt-1">შეიყვანე PIN და აირჩიე როლი</p>
              </div>
              <div className="icon-tile text-accent">
                <Gamepad2 className="h-5 w-5" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="label-text" htmlFor="join-name">
                  სახელი
                </label>
                <Input
                  id="join-name"
                  placeholder="შენი სახელი"
                  value={joinPlayerName}
                  onChange={(event) => setJoinPlayerName(event.target.value)}
                  maxLength={20}
                />
              </div>

              <div className="space-y-2">
                <label className="label-text" htmlFor="room-pin">
                  PIN
                </label>
                <Input
                  id="room-pin"
                  placeholder="ოთახის PIN"
                  value={roomPin}
                  onChange={(event) => {
                    setRoomPin(event.target.value.toUpperCase());
                    setShowRoleError(false);
                  }}
                  className="font-black uppercase"
                  maxLength={6}
                />
              </div>

              <div className="space-y-2">
                <p className="label-text">როლი</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={joinRole === "player"}
                    onClick={() => {
                      setJoinRole("player");
                      setShowRoleError(false);
                    }}
                    className={roleButtonClass(joinRole === "player", "accent")}
                  >
                    <Laugh className="h-4 w-4" />
                    ხუმარა
                  </button>
                  <button
                    type="button"
                    aria-pressed={joinRole === "judge"}
                    onClick={() => {
                      setJoinRole("judge");
                      setShowRoleError(false);
                    }}
                    className={roleButtonClass(joinRole === "judge", "accent")}
                  >
                    <Gavel className="h-4 w-4" />
                    მსაჯული
                  </button>
                </div>
                {showRoleError && <p className="rounded-xl bg-danger/15 px-3 py-2 text-sm font-bold text-danger">მსაჯული უკვე არსებობს</p>}
              </div>

              <Button onClick={joinRoom} disabled={isJoining} size="lg" variant="accent" className="w-full">
                {isJoining ? "ემატება..." : "შეუერთდი თამაშს"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </section>

        <section className="soft-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-success" />
            <h2 className="section-title">როგორ ვითამაშოთ?</h2>
          </div>
          <ol className="grid gap-2 text-sm font-semibold leading-relaxed text-text-soft sm:grid-cols-2">
            <li>1. შექმენი ან შეუერთდი ოთახს PIN-ით.</li>
            <li>2. აირჩიე როლი: ხუმარა ან მსაჯული.</li>
            <li>3. მინიმუმ 3 მოთამაშე იწყებს თამაშს.</li>
            <li>4. აირჩიე ყველაზე სასაცილო პასუხი და მოიგე ქულები.</li>
          </ol>
        </section>
      </main>
    </div>
  );
};

export default Index;
