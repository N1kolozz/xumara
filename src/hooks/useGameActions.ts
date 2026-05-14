import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Room, Player, GameState } from "@/types/game";
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
        await supabase.from("game_state").delete().eq("room_id", room.id);
        await supabase.from("submissions").delete().eq("room_id", room.id);
        await supabase.rpc("clear_room_hands", { p_room_id: room.id });
        await supabase.from("players").update({ in_game: false }).eq("room_id", room.id);
        await supabase.from("rooms").update({ status: "lobby" }).eq("id", room.id);

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
        await supabase.from("players").update({ in_game: false, hand: [] }).eq("id", currentPlayer.id);
        await supabase.from("submissions").delete().eq("room_id", room.id).eq("player_id", currentPlayer.id);

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
      const isHost = currentPlayer.is_host;
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

      await supabase.from("players").delete().eq("id", currentPlayer.id);

      const { data: remainingPlayers } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", room.id);

      if (!remainingPlayers || remainingPlayers.length === 0) {
        await supabase.from("rooms").delete().eq("id", room.id);
      } else {
        if (room.status === "playing") {
          const remainingComedians = remainingPlayers.filter(p => !p.is_judge).length;

          if (isJudge || remainingComedians < 2) {
            await supabase.from("game_state").delete().eq("room_id", room.id);
            await supabase.from("submissions").delete().eq("room_id", room.id);
            await supabase.rpc("clear_room_hands", { p_room_id: room.id });
            await supabase.from("players").update({ in_game: false }).eq("room_id", room.id);
            await supabase.from("rooms").update({ status: "lobby" }).eq("id", room.id);

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
          }
        }

        if (isHost && remainingPlayers.length > 0) {
          const newHost = remainingPlayers[Math.floor(Math.random() * remainingPlayers.length)];
          await supabase.from("rooms").update({ host_id: newHost.id }).eq("id", room.id);
          await supabase.from("players").update({ is_host: true }).eq("id", newHost.id);
          await supabase.from("players").update({ is_host: false }).eq("room_id", room.id).neq("id", newHost.id);
        }
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

  const handleStartGame = async (maxRounds: number) => {
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

      await supabase.from("submissions").delete().eq("room_id", room.id);
      await supabase.rpc("clear_room_hands", { p_room_id: room.id });

      const { error: playersUpdateError } = await supabase
        .from("players")
        .update({ score: 0, in_game: true })
        .eq("room_id", room.id);

      if (playersUpdateError) throw playersUpdateError;

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

      const { error: roomUpdateError, data: updatedRoomData } = await supabase
        .from("rooms")
        .update({ status: "playing" })
        .eq("id", room.id)
        .select()
        .single();

      if (roomUpdateError) throw roomUpdateError;

      const { data: refreshedCurrentPlayer } = await supabase
        .from("players")
        .select("*")
        .eq("id", currentPlayer.id)
        .single();

      if (updatedRoomData && refreshedCurrentPlayer) {
        setRoom(updatedRoomData as Room);
        setCurrentPlayer(refreshedCurrentPlayer as Player);
      }

      const { data: inboxCards } = await supabase.from("cards").select("*").eq("type", "inbox");

      if (inboxCards && inboxCards.length > 0) {
        const randomInbox = inboxCards[Math.floor(Math.random() * inboxCards.length)];
        const judgePlayer = updatedPlayers?.find(p => p.is_judge) || updatedPlayers?.[0];

        const { data: newGameState, error: gameStateError } = await supabase.from("game_state").insert({
          room_id: room.id,
          current_judge_id: judgePlayer.id,
          current_inbox_card_id: randomInbox.id,
          round_number: 1,
          phase: "submitting",
          max_rounds: maxRounds,
        }).select().single();

        if (gameStateError) throw gameStateError;

        const { error: handError } = await supabase.rpc("deal_initial_cards", { p_room_id: room.id });

        if (handError) {
          toast({
            title: "შეცდომა",
            description: "ბარათების დარიგება ვერ მოხერხდა",
            variant: "destructive",
          });
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 300));

        if (newGameState) {
          setGameState(newGameState as GameState);
        }
      }

    } catch (error) {
      toast({
        title: "შეცდომა",
        description: "თამაშის დაწყება ვერ მოხერხდა",
        variant: "destructive",
      });
    }
  };

  return {
    handleStartGame,
    handleLeaveGame,
    handleReturnToLobby,
  };
};
