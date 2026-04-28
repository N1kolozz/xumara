import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Laugh, Users, Gamepad2, PlusCircle } from "lucide-react";
const Index = () => {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const [createPlayerName, setCreatePlayerName] = useState("");
  const [joinPlayerName, setJoinPlayerName] = useState("");
  const [roomPin, setRoomPin] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [createRole, setCreateRole] = useState<"player" | "judge" | null>(null);
  const [joinRole, setJoinRole] = useState<"player" | "judge" | null>(null);
  const [showRoleError, setShowRoleError] = useState(false);
  const generatePin = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const getOrCreateGuestUser = async () => {
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) throw sessionError;
    if (session?.user) return session.user;

    const {
      data: { user },
      error: signInError
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
        variant: "destructive"
      });
      return;
    }
    if (!createRole) {
      toast({
        title: "აირჩიეთ როლი",
        description: "თამაშის დასაწყებად როლის არჩევა აუცილებელია",
        variant: "destructive"
      });
      return;
    }
    setIsCreating(true);
    try {
      const user = await getOrCreateGuestUser();
      
      // Retry room creation with unique PIN if collision occurs
      let room = null;
      let attempts = 0;
      const maxAttempts = 5;
      
      while (!room && attempts < maxAttempts) {
        attempts++;
        const pin = generatePin();
        
        const {
          data: roomData,
          error: roomError
        } = await supabase.from("rooms").insert({
          pin,
          status: "lobby"
        }).select().single();
        
        // If unique constraint violation, retry with new PIN
        if (roomError && roomError.code === '23505') {
          console.log(`PIN collision detected (${pin}), retrying...`);
          continue;
        }
        
        if (roomError) throw roomError;
        room = roomData;
      }
      
      if (!room) {
        throw new Error("Failed to generate unique PIN after multiple attempts");
      }
      const {
        data: player,
        error: playerError
      } = await supabase.from("players").insert({
        room_id: room.id,
        name: createPlayerName,
        is_host: true,
        is_judge: createRole === "judge",
        user_id: user.id
      }).select().single();
      if (playerError) throw playerError;

      // Use sessionStorage instead of localStorage to keep player per tab
      sessionStorage.setItem(`player_${room.id}`, player.id);
      localStorage.setItem(`player_${room.id}`, player.id);
      await supabase.from("rooms").update({
        host_id: player.id
      }).eq("id", room.id);
      toast({
        title: "ოთახი შეიქმნა!",
        description: `PIN: ${room.pin}`
      });
      navigate(`/game/${room.id}`);
    } catch (error) {
      console.error("Failed to create room:", error);
      toast({
        title: "შეცდომა",
        description: getErrorMessage(error),
        variant: "destructive"
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
        variant: "destructive"
      });
      return;
    }
    if (!joinRole) {
      toast({
        title: "აირჩიეთ როლი",
        description: "თამაშში შესასვლელად როლის არჩევა აუცილებელია",
        variant: "destructive"
      });
      return;
    }
    setIsJoining(true);
    setShowRoleError(false);
    try {
      const user = await getOrCreateGuestUser();
      const {
        data: room,
        error: roomError
      } = await supabase.from("rooms").select("*").eq("pin", roomPin.toUpperCase()).single();
      if (roomError || !room) {
        toast({
          title: "ოთახი ვერ მოიძებნა",
          description: "შეამოწმეთ PIN და სცადეთ ხელახლა",
          variant: "destructive"
        });
        return;
      }
      if (room.status !== "lobby") {
        toast({
          title: "თამაში უკვე დაწყებულია",
          description: "ამ ოთახში შესვლა შეუძლებელია",
          variant: "destructive"
        });
        return;
      }
      const {
        data: existingPlayers
      } = await supabase.from("players").select("*").eq("room_id", room.id);
      if (existingPlayers && existingPlayers.length >= 8) {
        toast({
          title: "ოთახი სავსეა",
          description: "ამ ოთახში მეტი ხუმარა ვეღარ დაემატება",
          variant: "destructive"
        });
        return;
      }

      // Check if judge already exists when trying to join as judge
      if (joinRole === "judge") {
        const existingJudge = existingPlayers?.find(p => p.is_judge);
        if (existingJudge) {
          setShowRoleError(true);
          setIsJoining(false);
          return;
        }
      }
      const {
        data: player,
        error: playerError
      } = await supabase.from("players").insert({
        room_id: room.id,
        name: joinPlayerName,
        is_host: false,
        is_judge: joinRole === "judge",
        user_id: user.id
      }).select().single();
      if (playerError) throw playerError;

      // Use sessionStorage instead of localStorage to keep player per tab
      sessionStorage.setItem(`player_${room.id}`, player.id);
      localStorage.setItem(`player_${room.id}`, player.id);
      toast({
        title: "წარმატებით შეუერთდით!",
        description: `მოგესალმებით ოთახში: ${room.pin}`
      });
      navigate(`/game/${room.id}`);
    } catch (error) {
      console.error("Failed to join room:", error);
      toast({
        title: "შეცდომა",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    } finally {
      setIsJoining(false);
    }
  };
  return <div className="min-h-screen bg-background flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-4xl space-y-6 sm:space-y-8 animate-slide-in">
        {/* Hero Section */}
        <div className="text-center space-y-3 sm:space-y-4">
          <div className="inline-block">
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-primary mb-2">ხუმარა</h1>
            <div className="h-1 w-full bg-primary rounded-full"></div>
          </div>
          <p className="text-base sm:text-xl md:text-3xl text-center font-bold text-slate-300">წაიხუმრე შენებურად</p>

          {/* Features */}
          <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mt-4 sm:mt-6">
            <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-primary/10 rounded-full">
              <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <span className="text-xs sm:text-sm font-medium">3-8 ხუმარა</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-secondary/20 rounded-full">
              <Gamepad2 className="h-4 w-4 sm:h-5 sm:w-5 text-secondary" />
              <span className="text-xs sm:text-sm font-medium">ითამაშე ონლაინ</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-accent/10 rounded-full">
              <Laugh className="h-4 w-4 sm:h-5 sm:w-5 text-accent" />
              <span className="text-xs sm:text-sm font-medium">ხუმარა ხუმრობები</span>
            </div>
          </div>
        </div>

        {/* Game Cards */}
        <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
          {/* Create Room Card */}
          <Card className="p-4 sm:p-6 md:p-8 bg-card/50 backdrop-blur-sm border-primary/20 space-y-4 sm:space-y-6 hover:border-primary/40 transition-all">
            <div className="space-y-1 sm:space-y-2">
              <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary flex items-center justify-center">
                  <PlusCircle className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
                </div>
                ახალი ოთახი
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                შექმენი ოთახი და მოიწვიე მეგობრები
              </p>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <Input placeholder="შენი სახელი" value={createPlayerName} onChange={e => setCreatePlayerName(e.target.value)} className="h-11 sm:h-12 text-base sm:text-lg touch-manipulation" maxLength={20} />

              <div className="space-y-2">
                <p className="text-sm font-medium">აირჩიეთ როლი:</p>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <Button type="button" variant={createRole === "player" ? "default" : "outline"} onClick={() => setCreateRole("player")} className="h-11 sm:h-12 text-sm sm:text-base touch-manipulation hover:!bg-primary hover:!text-primary-foreground">
                    ხუმარა
                  </Button>
                  <Button type="button" variant={createRole === "judge" ? "default" : "outline"} onClick={() => setCreateRole("judge")} className="h-11 sm:h-12 text-sm sm:text-base touch-manipulation hover:!bg-primary hover:!text-primary-foreground">
                    მსაჯული
                  </Button>
                </div>
              </div>

              <Button onClick={createRoom} disabled={isCreating} className="w-full h-12 sm:h-14 text-base sm:text-lg font-bold bg-primary hover:bg-primary/90 transition-colors touch-manipulation">
                {isCreating ? "იქმნება..." : "ოთახის შექმნა"}
              </Button>
            </div>
          </Card>

          {/* Join Room Card */}
          <Card className="p-4 sm:p-6 md:p-8 bg-card/50 backdrop-blur-sm border-accent/20 space-y-4 sm:space-y-6 hover:border-accent/40 transition-all">
            <div className="space-y-1 sm:space-y-2">
              <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-accent flex items-center justify-center">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 text-accent-foreground" />
                </div>
                შეუერთდი ოთახს
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                შეიყვანე ოთახის კოდი რომ შეუერთდე
              </p>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <Input placeholder="შენი სახელი" value={joinPlayerName} onChange={e => setJoinPlayerName(e.target.value)} className="h-11 sm:h-12 text-base sm:text-lg touch-manipulation" maxLength={20} />

              <Input placeholder="ოთახის PIN" value={roomPin} onChange={e => {
              setRoomPin(e.target.value.toUpperCase());
              setShowRoleError(false);
            }} className="h-11 sm:h-12 text-base sm:text-lg font-mono tracking-wider touch-manipulation" maxLength={6} />

              <div className="space-y-2">
                <p className="text-sm font-medium">აირჩიეთ როლი:</p>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <Button type="button" variant={joinRole === "player" ? "default" : "outline"} onClick={() => {
                  setJoinRole("player");
                  setShowRoleError(false);
                }} className={`h-11 sm:h-12 text-sm sm:text-base touch-manipulation hover:!bg-accent hover:!text-accent-foreground ${joinRole === "player" ? "!bg-accent !text-accent-foreground" : ""}`}>
                    ხუმარა
                  </Button>
                  <Button type="button" variant={joinRole === "judge" ? "default" : "outline"} onClick={() => {
                  setJoinRole("judge");
                  setShowRoleError(false);
                }} className={`h-11 sm:h-12 text-sm sm:text-base touch-manipulation hover:!bg-accent hover:!text-accent-foreground ${joinRole === "judge" ? "!bg-accent !text-accent-foreground" : ""}`}>
                    მსაჯული
                  </Button>
                </div>
                {showRoleError && <p className="text-xs sm:text-sm text-destructive font-medium">
                    მსაჯული უკვე არსებობს! გთხოვთ აირჩიოთ ხუმარას როლი
                  </p>}
              </div>

              <Button onClick={joinRoom} disabled={isJoining} className="w-full h-12 sm:h-14 text-base sm:text-lg font-bold bg-accent hover:bg-accent/90 transition-colors touch-manipulation">
                {isJoining ? "ემატება..." : "შეუერთდი თამაშს"}
              </Button>
            </div>
          </Card>
        </div>

        {/* How to Play */}
        <Card className="p-4 sm:p-6 bg-card/30 backdrop-blur-sm border-green-500/50">
          <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3 flex items-center gap-2">
            <Gamepad2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
            როგორ ითამაშოთ?
          </h3>
          <ol className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-muted-foreground list-decimal list-inside">
            <li>შექმენით ოთახი ან შეუერთდით PIN-ით და აირჩიეთ როლი (ხუმარა ან მსაჯული)</li>
            <li>მინიმუმ 3 მოთამაშე სჭირდება თამაშის დასაწყებად (მაქსიმუმ 8)</li>
            <li>მასპინძელი ირჩევს რაუნდების რაოდენობას (1-დან 10-მდე)</li>
            <li>ყოველ რაუნდში მსაჯული კითხულობს "INBOX" კითხვას</li>
            <li>ხუმარები ირჩევენ ყველაზე სასაცილო "REPLY" პასუხს თავიანთი 6 ბარათიდან</li>
            <li>მსაჯული ირჩევს საუკეთესო პასუხს და გამარჯვებული იღებს 1 ქულას</li>
            <li>ყველა რაუნდის დასრულების შემდეგ, ყველაზე მეტი ქულის მქონე ხუმარა არის გამარჯვებული</li>
          </ol>
        </Card>
      </div>
    </div>;
};
export default Index;
