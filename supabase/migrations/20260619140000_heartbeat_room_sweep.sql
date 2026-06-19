-- Server-side backstop for abandoned rooms. Presence cleanup (see
-- 20260619130000 + useGameSession.ts) handles the common cases quickly, but it
-- relies on at least one client staying connected to do the eviction. When the
-- LAST player vanishes without a clean exit (hard crash, force-quit, OS kills
-- the tab) no client is left to clean up, so the room would linger forever.
--
-- Fix: every client periodically calls heartbeat() to stamp players.last_seen,
-- and a pg_cron job sweeps players whose heartbeat went stale, reusing the same
-- removal logic as leave/prune. Removing the last player deletes the room, so
-- abandoned rooms disappear on their own within a couple of minutes.

-- ── Liveness column ──────────────────────────────────────────────────────────
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS last_seen timestamptz NOT NULL DEFAULT now();

-- ── heartbeat: clients call this on an interval while in a room ───────────────
CREATE OR REPLACE FUNCTION public.heartbeat(p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Only let a caller refresh their own player's liveness.
  UPDATE players
  SET last_seen = now()
  WHERE id = p_player_id
    AND (v_uid IS NULL OR user_id = v_uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.heartbeat(uuid) TO authenticated, anon;

-- ── sweep_stale_players: the periodic cleanup ────────────────────────────────
-- STALE_AFTER is deliberately several heartbeat intervals so a briefly
-- backgrounded phone isn't evicted. Each stale player goes through the shared
-- _remove_player_from_room helper so host reassignment / mid-game teardown /
-- empty-room deletion all behave exactly like a normal leave. A final pass
-- drops any room that somehow still has no players.
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
    WHERE last_seen < now() - interval '120 seconds'
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

-- ── Schedule it every minute via pg_cron ─────────────────────────────────────
-- If this CREATE EXTENSION fails on `supabase db push`, enable pg_cron once in
-- the dashboard (Database → Extensions → pg_cron) and re-run this file.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Re-scheduling is idempotent: drop any prior job with this name first.
DO $$
BEGIN
  PERFORM cron.unschedule('sweep-stale-players');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'sweep-stale-players',
  '* * * * *',
  $$ SELECT public.sweep_stale_players(); $$
);
