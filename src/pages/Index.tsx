import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Gavel, Laugh, Plus, LogIn, X, Users, Gamepad2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Role = "player" | "judge";
type ModalType = "create" | "join" | null;

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
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Animate modal in/out
  useEffect(() => {
    if (activeModal) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setModalVisible(true));
      });
    }
  }, [activeModal]);

  const closeModal = () => {
    // Blur any focused input to dismiss the keyboard before closing
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setModalVisible(false);
    setTimeout(() => {
      setActiveModal(null);
      setShowRoleError(false);
    }, 320);
  };

  const openModal = (type: ModalType) => {
    setActiveModal(type);
  };

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
      "home-role-btn",
      active && (tone === "primary" ? "home-role-btn-active-primary" : "home-role-btn-active-accent"),
    );

  return (
    <div className="home-shell">
      {/* Background glow effects */}
      <div className="home-glow" />

      {/* Main content */}
      <main className="home-screen">
        {/* Hero section with logo */}
        <section className="home-hero">
          <div className="home-logo-wrap">
            <img
              src="/jokerlogo.png"
              alt="ხუმარა"
              className="home-logo-img"
              draggable={false}
            />
            <div className="home-logo-glow" />
          </div>
          <h1 className="home-brand">ხუმარა</h1>
          <p className="home-subtitle">PARTY GAME</p>
        </section>

        {/* Action cards */}
        <section className="home-actions">
          {/* Create Room Card */}
          <button
            type="button"
            className="home-card home-card-create"
            onClick={() => openModal("create")}
            id="btn-create-room"
          >
            <div className="home-card-glow home-card-glow-create" />
            <div className="home-card-badge home-card-badge-create">
              <Plus className="h-3.5 w-3.5" />
              <span>ახალი</span>
            </div>
            <div className="home-card-icon-wrap home-card-icon-create">
              <Users className="h-8 w-8" />
            </div>
            <h2 className="home-card-title">შექმენი<br />ოთახი</h2>
            <p className="home-card-desc">მოიწვიე მეგობრები<br />PIN-ით</p>
          </button>

          {/* Join Room Card */}
          <button
            type="button"
            className="home-card home-card-join"
            onClick={() => openModal("join")}
            id="btn-join-room"
          >
            <div className="home-card-glow home-card-glow-join" />
            <div className="home-card-badge home-card-badge-join">
              <LogIn className="h-3.5 w-3.5" />
            </div>
            <div className="home-card-icon-wrap home-card-icon-join">
              <Gamepad2 className="h-8 w-8" />
            </div>
            <h2 className="home-card-title">შეუერთდი<br />ოთახს</h2>
            <p className="home-card-desc">შეიყვანე PIN და<br />არჩიე როლი</p>
          </button>
        </section>
      </main>

      {/* Modal Overlay */}
      {activeModal && (
        <div
          className={cn("home-modal-overlay", modalVisible && "home-modal-overlay-visible")}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className={cn("home-modal-panel", modalVisible && "home-modal-panel-visible")}>
            {/* Modal Header */}
            <div className="home-modal-header">
              <div className="home-modal-header-left">
                <div className={cn(
                  "home-modal-icon",
                  activeModal === "create" ? "home-modal-icon-create" : "home-modal-icon-join"
                )}>
                  {activeModal === "create" ? <Users className="h-5 w-5" /> : <Gamepad2 className="h-5 w-5" />}
                </div>
                <div>
                  <p className="home-modal-kicker">
                    {activeModal === "create" ? "ახალი ოთახი" : "შეუერთდი"}
                  </p>
                  <h2 className="home-modal-title">
                    {activeModal === "create" ? "შექმენი ოთახი" : "შეუერთდი ოთახს"}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className="home-modal-close"
                onClick={closeModal}
                aria-label="დახურვა"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="home-modal-body">
              {activeModal === "create" ? (
                <>
                  <div className="home-field">
                    <label className="home-field-label" htmlFor="modal-create-name">
                      სახელი
                    </label>
                    <Input
                      id="modal-create-name"
                      placeholder="შენი სახელი"
                      value={createPlayerName}
                      onChange={(e) => setCreatePlayerName(e.target.value)}
                      maxLength={20}
                      className="home-input"
                    />
                  </div>

                  <div className="home-field">
                    <p className="home-field-label">როლი</p>
                    <div className="home-role-grid">
                      <button
                        type="button"
                        aria-pressed={createRole === "player"}
                        onClick={() => setCreateRole("player")}
                        className={roleButtonClass(createRole === "player", "primary")}
                      >
                        <Laugh className="h-5 w-5" />
                        ხუმარა
                      </button>
                      <button
                        type="button"
                        aria-pressed={createRole === "judge"}
                        onClick={() => setCreateRole("judge")}
                        className={roleButtonClass(createRole === "judge", "primary")}
                      >
                        <Gavel className="h-5 w-5" />
                        მსაჯული
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={createRoom}
                    disabled={isCreating}
                    className="home-submit-btn home-submit-btn-create"
                  >
                    {isCreating ? (
                      <span className="home-spinner" />
                    ) : (
                      <>
                        ოთახის შექმნა
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <div className="home-field">
                    <label className="home-field-label" htmlFor="modal-join-name">
                      სახელი
                    </label>
                    <Input
                      id="modal-join-name"
                      placeholder="შენი სახელი"
                      value={joinPlayerName}
                      onChange={(e) => setJoinPlayerName(e.target.value)}
                      maxLength={20}
                      className="home-input"
                    />
                  </div>

                  <div className="home-field">
                    <label className="home-field-label" htmlFor="modal-join-pin">
                      PIN
                    </label>
                    <Input
                      id="modal-join-pin"
                      placeholder="ოთახის PIN"
                      value={roomPin}
                      onChange={(e) => {
                        setRoomPin(e.target.value.toUpperCase());
                        setShowRoleError(false);
                      }}
                      className="home-input home-input-pin"
                      maxLength={6}
                    />
                  </div>

                  <div className="home-field">
                    <p className="home-field-label">როლი</p>
                    <div className="home-role-grid">
                      <button
                        type="button"
                        aria-pressed={joinRole === "player"}
                        onClick={() => {
                          setJoinRole("player");
                          setShowRoleError(false);
                        }}
                        className={roleButtonClass(joinRole === "player", "accent")}
                      >
                        <Laugh className="h-5 w-5" />
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
                        <Gavel className="h-5 w-5" />
                        მსაჯული
                      </button>
                    </div>
                    {showRoleError && (
                      <p className="home-role-error">მსაჯული უკვე არსებობს</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={joinRoom}
                    disabled={isJoining}
                    className="home-submit-btn home-submit-btn-join"
                  >
                    {isJoining ? (
                      <span className="home-spinner" />
                    ) : (
                      <>
                        შეუერთდი თამაშს
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
