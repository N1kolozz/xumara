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
      // Anonymous sign-in first so the RPC has an auth.uid() to own the player.
      await getOrCreateGuestUser();

      // create_room generates a unique PIN, inserts the room + host player and
      // wires up host_id atomically (rooms/players are read-only to clients).
      const { data, error } = await supabase.rpc("create_room", {
        p_player_name: playerName.trim(),
        p_is_judge: role === "judge",
      });
      if (error) throw error;

      const result = data as { room_id: string; player_id: string; pin: string };

      sessionStorage.setItem(`player_${result.room_id}`, result.player_id);
      localStorage.setItem(`player_${result.room_id}`, result.player_id);

      navigate(`/game/${result.room_id}`);
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
      // Anonymous sign-in first so the RPC has an auth.uid() to own the player.
      await getOrCreateGuestUser();

      // join_room validates (room exists, in lobby, not full, judge free) and
      // inserts the player atomically under a room lock, then reports the
      // outcome so we can show the right message.
      const { data, error } = await supabase.rpc("join_room", {
        p_pin: roomPin.toUpperCase(),
        p_player_name: playerName.trim(),
        p_is_judge: role === "judge",
      });
      if (error) throw error;

      const result = data as {
        ok: boolean;
        reason?: string;
        room_id?: string;
        player_id?: string;
      };

      if (!result.ok) {
        switch (result.reason) {
          case "started":
            toast({
              title: "თამაში უკვე დაწყებულია",
              description: "ამ ოთახში შესვლა შეუძლებელია",
              variant: "destructive",
            });
            return false;
          case "full":
            toast({
              title: "ოთახი სავსეა",
              description: "ამ ოთახში მეტი მოთამაშე ვეღარ დაემატება",
              variant: "destructive",
            });
            return false;
          case "judge_taken":
            setShowRoleError(true);
            return false;
          default:
            toast({
              title: "ოთახი ვერ მოიძებნა",
              description: "შეამოწმეთ PIN და სცადეთ ხელახლა",
              variant: "destructive",
            });
            return false;
        }
      }

      sessionStorage.setItem(`player_${result.room_id}`, result.player_id!);
      localStorage.setItem(`player_${result.room_id}`, result.player_id!);
      navigate(`/game/${result.room_id}`);
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
