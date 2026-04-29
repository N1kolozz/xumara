import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { Role } from "@/types/game";

export const useRoomSetup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
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

  const createRoom = async (playerName: string, role: Role) => {
    if (!playerName.trim()) {
      toast({
        title: "შეიყვანეთ სახელი",
        description: "თამაშის დასაწყებად სახელი აუცილებელია",
        variant: "destructive",
      });
      return false;
    }

    if (!role) {
      toast({
        title: "აირჩიეთ როლი",
        description: "თამაშის დასაწყებად როლის არჩევა აუცილებელია",
        variant: "destructive",
      });
      return false;
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
          name: playerName,
          is_host: true,
          is_judge: role === "judge",
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
      return true;
    } catch (error) {
      console.error("Failed to create room:", error);
      toast({
        title: "შეცდომა",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      return false;
    } finally {
      setIsCreating(false);
    }
  };

  const joinRoom = async (playerName: string, roomPin: string, role: Role) => {
    if (!playerName.trim() || !roomPin.trim()) {
      toast({
        title: "შეავსეთ ყველა ველი",
        description: "სახელი და PIN აუცილებელია",
        variant: "destructive",
      });
      return false;
    }

    if (!role) {
      toast({
        title: "აირჩიეთ როლი",
        description: "თამაშში შესასვლელად როლის არჩევა აუცილებელია",
        variant: "destructive",
      });
      return false;
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
        return false;
      }

      if (room.status !== "lobby") {
        toast({
          title: "თამაში უკვე დაწყებულია",
          description: "ამ ოთახში შესვლა შეუძლებელია",
          variant: "destructive",
        });
        return false;
      }

      const { data: existingPlayers } = await supabase.from("players").select("*").eq("room_id", room.id);

      if (existingPlayers && existingPlayers.length >= 8) {
        toast({
          title: "ოთახი სავსეა",
          description: "ამ ოთახში მეტი მოთამაშე ვეღარ დაემატება",
          variant: "destructive",
        });
        return false;
      }

      if (role === "judge") {
        const existingJudge = existingPlayers?.find((player) => player.is_judge);
        if (existingJudge) {
          setShowRoleError(true);
          return false;
        }
      }

      const { data: player, error: playerError } = await supabase
        .from("players")
        .insert({
          room_id: room.id,
          name: playerName,
          is_host: false,
          is_judge: role === "judge",
          user_id: user.id,
        })
        .select()
        .single();

      if (playerError) throw playerError;

      sessionStorage.setItem(`player_${room.id}`, player.id);
      localStorage.setItem(`player_${room.id}`, player.id);
      navigate(`/game/${room.id}`);
      return true;
    } catch (error) {
      console.error("Failed to join room:", error);
      toast({
        title: "შეცდომა",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      return false;
    } finally {
      setIsJoining(false);
    }
  };

  return {
    createRoom,
    joinRoom,
    isCreating,
    isJoining,
    showRoleError,
    setShowRoleError,
  };
};
