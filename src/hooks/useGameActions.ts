import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Room, Player, GameState } from "@/types/game";
import { HAND_SIZE } from "@/lib/gameConfig";
import React from "react";

interface UseGameActionsProps {
  roomId: string | undefined;
  room: Room | null;
  currentPlayer: Player | null;
  players: Player[];
  setRoom: React.Dispatch<React.SetStateAction<Room | null>>;
  setCurrentPlayer: React.Dispatch<React.SetStateAction<Player | null>>;
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  channelRef: React.MutableRefObject<ReturnType<typeof supabase.channel> | null>;
}

export const useGameActions = ({
  roomId,
  room,
  currentPlayer,
  players,
  setRoom,
  setCurrentPlayer,
  setPlayers,
  setGameState,
  channelRef,
}: UseGameActionsProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleReturnToLobby = async () => {
    if (!room || !currentPlayer) return;

    try {
      const isJudge = currentPlayer.is_judge;

      const { data: activePlayers } = await supabase
        .from('players')
        .select('id, is_judge, in_game')
        .eq('room_id', room.id)
        .eq('in_game', true);

      const activeComedianCount = activePlayers?.filter(p => !p.is_judge).length || 0;
      const remainingComedians = isJudge ? activeComedianCount : activeComedianCount - 1;

      if (isJudge || remainingComedians < 2) {
        await supabase.rpc("reset_room_to_lobby", { p_room_id: room.id, p_reset_scores: false });

        const channel = supabase.channel(`room_${room.id}`);
        await channel.subscribe();
        await channel.send({
          type: 'broadcast',
          event: 'return_to_lobby',
          payload: {
            reason: isJudge ? 'judge_left' : 'insufficient_players',
            playerName: currentPlayer.name
          }
        });
        await supabase.removeChannel(channel);

        setRoom({ ...room, status: "lobby" });
        setCurrentPlayer({ ...currentPlayer, in_game: false });

        toast({
          title: "დაბრუნდით ლობიში",
          description: isJudge
            ? "მსაჯული დაბრუნდა ლობიში - ამიტომ, ყველა დაბრუნდით ლობიში"
            : "არასაკმარისი მოთამაშე",
        });
      } else {
        await supabase.rpc("leave_game_round", { p_room_id: room.id, p_player_id: currentPlayer.id });

        setRoom({ ...room, status: "lobby" });
        setCurrentPlayer({ ...currentPlayer, in_game: false });
      }
    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "ლობიში დაბრუნება ვერ მოხერხდა",
        variant: "destructive",
      });
    }
  };

  const handleLeaveGame = async () => {
    if (!currentPlayer || !room) return;

    try {
      const isJudge = currentPlayer.is_judge;

      if (channelRef.current) {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'player_left',
          payload: {
            playerId: currentPlayer.id,
            playerName: currentPlayer.name,
          }
        });
      }

      // Player removal, empty-room cleanup, mid-game teardown and host
      // reassignment all run atomically in leave_room (players/rooms are
      // read-only to clients). It reports whether the room was sent back to the
      // lobby so we can broadcast that to everyone still in it.
      const { data: leaveResult } = await supabase.rpc("leave_room", {
        p_room_id: room.id,
        p_player_id: currentPlayer.id,
      });

      const result = leaveResult as { returned_to_lobby?: boolean; reason?: string } | null;
      if (result?.returned_to_lobby) {
        const channel = supabase.channel(`room_${room.id}`);
        await channel.subscribe();
        await channel.send({
          type: 'broadcast',
          event: 'return_to_lobby',
          payload: {
            reason: result.reason ?? (isJudge ? 'judge_left' : 'insufficient_players'),
            playerName: currentPlayer.name
          }
        });
        await supabase.removeChannel(channel);
      }

      sessionStorage.removeItem(`player_${room.id}`);
      localStorage.removeItem(`player_${room.id}`);

      navigate("/");
    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "ოთახიდან გასვლა ვერ მოხერხდა",
        variant: "destructive",
      });
    }
  };

  const handleStartGame = async (maxRounds: number, pack: string | null = null) => {
    if (!currentPlayer?.is_host || !room) return;

    if (players.length < 3) {
      toast({
        title: "არასაკმარისი ხუმარა",
        description: "თამაშის დასაწყებად მინიმუმ 3 ხუმარა არის საჭირო",
        variant: "destructive",
      });
      return;
    }

    const hasJudge = players.some(p => p.is_judge);
    if (!hasJudge) {
      toast({
        title: "მსაჯული აკლია",
        description: "თამაშის დასაწყებად აუცილებელია მსაჯული",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: existingGameState } = await supabase
        .from("game_state")
        .select("*")
        .eq("room_id", room.id)
        .maybeSingle();

      if (existingGameState) {
        toast({
          title: "თამაში უკვე დაწყებულია",
          description: "თამაში უკვე მიმდინარეობს",
          variant: "destructive",
        });
        return;
      }

      // Validate the chosen pack has enough reply cards before we start — the
      // category filter can otherwise silently starve the deal RPC.
      const comedianCount = players.filter((p) => !p.is_judge).length;
      let supplyQuery = supabase
        .from("cards")
        .select("*", { count: "exact", head: true })
        .eq("type", "reply")
        .eq("is_blank", false);
      if (pack) supplyQuery = supplyQuery.eq("category", pack);
      const { count: replyCount } = await supplyQuery;

      if ((replyCount ?? 0) < comedianCount * HAND_SIZE) {
        toast({
          title: "ბარათები არ კმარა",
          description: `ამ პაკეტში არ არის საკმარისი ბარათი ${comedianCount} ხუმარასთვის`,
          variant: "destructive",
        });
        return;
      }

      // All the game-start writes (clear submissions/hands, reset players, set
      // the room playing, create game_state, deal the opening hands) run
      // atomically in the start_game_state RPC — the tables are read-only here.
      const { data: newGameState, error: startError } = await supabase.rpc("start_game_state", {
        p_room_id: room.id,
        p_max_rounds: maxRounds,
        p_pack: pack,
      });

      if (startError) throw startError;

      const { data: updatedPlayers } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", room.id);

      if (updatedPlayers) {
        setPlayers(updatedPlayers as Player[]);
      }

      const broadcastChannel = supabase.channel(`room:${room.id}:broadcast`);
      await broadcastChannel.subscribe();
      await broadcastChannel.send({
        type: 'broadcast',
        event: 'players_updated',
        payload: { room_id: room.id }
      });

      await new Promise(resolve => setTimeout(resolve, 500));
      await supabase.removeChannel(broadcastChannel);

      const { data: updatedRoomData } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", room.id)
        .single();

      const { data: refreshedCurrentPlayer } = await supabase
        .from("players")
        .select("*")
        .eq("id", currentPlayer.id)
        .single();

      if (updatedRoomData) setRoom(updatedRoomData as Room);
      if (refreshedCurrentPlayer) setCurrentPlayer(refreshedCurrentPlayer as Player);
      if (newGameState) setGameState(newGameState as unknown as GameState);

    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "თამაშის დაწყება ვერ მოხერხდა",
        variant: "destructive",
      });
    }
  };

  // Restart the same room with the same pack + rounds, keeping everyone seated.
  const handleRematch = async () => {
    if (!currentPlayer?.is_host || !room) return;

    try {
      // Reset submissions/hands/scores, re-deal, pick a fresh inbox card and
      // flip the room back to playing — all atomically, server-side.
      const { error } = await supabase.rpc("rematch_game", { p_room_id: room.id });
      if (error) throw error;
    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "თამაშის თავიდან დაწყება ვერ მოხერხდა",
        variant: "destructive",
      });
    }
  };

  // After a game finishes, send the whole room back to the lobby (full reset).
  const handleEndToLobby = async () => {
    if (!room) return;

    try {
      await supabase.rpc("reset_room_to_lobby", { p_room_id: room.id, p_reset_scores: true });

      setRoom({ ...room, status: "lobby" });
      setCurrentPlayer((prev) => (prev ? { ...prev, in_game: false } : prev));
    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "ლობიში დაბრუნება ვერ მოხერხდა",
        variant: "destructive",
      });
    }
  };

  return {
    handleStartGame,
    handleLeaveGame,
    handleReturnToLobby,
    handleRematch,
    handleEndToLobby,
  };
};
