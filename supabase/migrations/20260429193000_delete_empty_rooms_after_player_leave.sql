-- Let a signed-in guest remove their own player row when leaving a room.
DROP POLICY IF EXISTS "Players can leave rooms" ON public.players;

CREATE POLICY "Players can leave rooms"
ON public.players
FOR DELETE
USING (user_id = auth.uid());

-- Keep room storage clean: once the last player leaves, remove that room.
CREATE OR REPLACE FUNCTION public.delete_empty_room_after_player_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.players
    WHERE players.room_id = OLD.room_id
  ) THEN
    DELETE FROM public.rooms
    WHERE rooms.id = OLD.room_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS delete_empty_room_after_player_leave ON public.players;

CREATE TRIGGER delete_empty_room_after_player_leave
AFTER DELETE ON public.players
FOR EACH ROW
EXECUTE FUNCTION public.delete_empty_room_after_player_leave();
