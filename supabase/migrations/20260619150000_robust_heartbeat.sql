-- Fix: active lobby players were being swept (and their room deleted) within a
-- couple of minutes. Root cause: heartbeat() only refreshed last_seen when the
-- player row's user_id matched auth.uid(). Any mismatch (rotated/!= anonymous
-- session) made the UPDATE touch zero rows, so last_seen froze at join time and
-- sweep_stale_players() reaped a player who was sitting right there.
--
-- Two changes:
--   1. heartbeat() now updates by player id alone. The client-held player_id is
--      already the capability that identifies the player (it lives in their own
--      storage and gates leave/submit), so this is safe — worst case an outsider
--      keeps a room alive slightly longer, which is harmless.
--   2. The sweep's staleness window grows from 120s to 5 minutes. The sweep only
--      exists to reclaim a room whose LAST player hard-crashed (presence + the
--      pagehide handler cover clean exits and disconnects while others remain),
--      so a generous window can't hurt and makes false eviction of a live, but
--      briefly-throttled (e.g. backgrounded mobile), player essentially
--      impossible.

CREATE OR REPLACE FUNCTION public.heartbeat(p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE players SET last_seen = now() WHERE id = p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.heartbeat(uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.sweep_stale_players()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT id, room_id
    FROM players
    WHERE last_seen < now() - interval '5 minutes'
  LOOP
    -- Re-check existence: a prior iteration may have cascaded this row away.
    IF EXISTS (SELECT 1 FROM players WHERE id = rec.id) THEN
      PERFORM public._remove_player_from_room(rec.room_id, rec.id);
    END IF;
  END LOOP;

  DELETE FROM rooms r
  WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.room_id = r.id);
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_stale_players() FROM PUBLIC, anon, authenticated;
