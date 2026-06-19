-- Ghost-room cleanup: let the players still connected to a room evict members
-- whose realtime connection has dropped (closed tab / killed app / lost network)
-- without ever tapping "leave". The client uses Supabase Realtime Presence to
-- notice the disconnect and, after a grace period, one elected client calls
-- prune_absent_player. Removing the last player deletes the room (and everything
-- that cascades off it) from the database.
--
-- leave_room (self-removal, ownership-checked) and prune_absent_player
-- (remove another member of a room you belong to) share the exact same
-- post-removal bookkeeping, so that logic moves into one SECURITY DEFINER helper.

-- ── Shared bookkeeping: remove a player, then heal the room ───────────────────
-- Deletes the player and, depending on what they were:
--   * drops the room (and cascades) when they were the last one,
--   * tears an in-progress game back to the lobby when the judge leaves or too
--     few comedians remain,
--   * reassigns the host when the host leaves.
-- Returns the same shape leave_room used to return.
CREATE OR REPLACE FUNCTION public._remove_player_from_room(
  p_room_id uuid,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was_host boolean;
  v_was_judge boolean;
  v_status text;
  v_remaining int;
  v_remaining_comedians int;
  v_returned boolean := false;
  v_reason text := NULL;
  v_new_host uuid;
BEGIN
  SELECT is_host, is_judge INTO v_was_host, v_was_judge
  FROM players WHERE id = p_player_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'room_deleted', false);
  END IF;

  SELECT status INTO v_status FROM rooms WHERE id = p_room_id;

  DELETE FROM players WHERE id = p_player_id;

  SELECT count(*) INTO v_remaining FROM players WHERE room_id = p_room_id;
  IF v_remaining = 0 THEN
    -- Last player gone: delete the room explicitly rather than trusting the
    -- AFTER DELETE trigger to be installed (it wasn't, in production — rooms
    -- were piling up empty). Cascading FKs wipe game_state, submissions and
    -- player_hands. Harmless no-op if the trigger already removed it.
    DELETE FROM rooms WHERE id = p_room_id;
    RETURN jsonb_build_object('ok', true, 'room_deleted', true);
  END IF;

  IF v_status = 'playing' THEN
    SELECT count(*) INTO v_remaining_comedians
    FROM players WHERE room_id = p_room_id AND is_judge = false;

    IF v_was_judge OR v_remaining_comedians < 2 THEN
      DELETE FROM game_state WHERE room_id = p_room_id;
      DELETE FROM submissions WHERE room_id = p_room_id;
      UPDATE players SET hand = '{}', in_game = false WHERE room_id = p_room_id;
      UPDATE rooms SET status = 'lobby' WHERE id = p_room_id;
      v_returned := true;
      v_reason := CASE WHEN v_was_judge THEN 'judge_left' ELSE 'insufficient_players' END;
    END IF;
  END IF;

  IF v_was_host THEN
    SELECT id INTO v_new_host
    FROM players WHERE room_id = p_room_id ORDER BY random() LIMIT 1;
    IF v_new_host IS NOT NULL THEN
      UPDATE rooms SET host_id = v_new_host WHERE id = p_room_id;
      UPDATE players SET is_host = (id = v_new_host) WHERE room_id = p_room_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'room_deleted', false,
    'returned_to_lobby', v_returned,
    'reason', v_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public._remove_player_from_room(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── leave_room: self-removal, unchanged behaviour ────────────────────────────
-- Now just enforces "you may only remove your own player" and delegates the
-- bookkeeping to the shared helper.
CREATE OR REPLACE FUNCTION public.leave_room(
  p_room_id uuid,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- The player being removed must belong to the caller's session.
  IF v_uid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM players WHERE id = p_player_id AND user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  RETURN public._remove_player_from_room(p_room_id, p_player_id);
END;
$$;

-- ── prune_absent_player: evict a disconnected member ─────────────────────────
-- Lets a client remove ANOTHER player from a room, but only if the caller is
-- themselves a current member of that room. The "is this player actually gone?"
-- judgement is made on the client from Realtime Presence (with a grace period);
-- the server only guarantees the caller is a legitimate participant, so a
-- random outsider can't wipe a room. NOTE: this does allow one member to evict
-- another, which is acceptable for a casual party game (the evicted player can
-- just rejoin with the PIN). If you later need this to be tamper-proof, switch
-- to the heartbeat + scheduled-sweep approach instead.
CREATE OR REPLACE FUNCTION public.prune_absent_player(
  p_room_id uuid,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- The caller must be a live member of the room they're cleaning up.
  IF NOT EXISTS (
    SELECT 1 FROM players WHERE room_id = p_room_id AND user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- Don't let a member remove themselves through this path (that's leave_room),
  -- and make sure the target really belongs to this room.
  IF EXISTS (
    SELECT 1 FROM players WHERE id = p_player_id AND user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cannot_prune_self');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM players WHERE id = p_player_id AND room_id = p_room_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'room_deleted', false);
  END IF;

  RETURN public._remove_player_from_room(p_room_id, p_player_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.prune_absent_player(uuid, uuid) TO authenticated;

-- ── Re-assert the empty-room trigger ─────────────────────────────────────────
-- This existed in migration 20260429193000 but was missing from the live DB
-- (empty rooms were never deleted). Re-create it idempotently as a backstop —
-- the RPCs above now delete the room explicitly, so this is just defence in
-- depth for any other path that deletes a player row.
CREATE OR REPLACE FUNCTION public.delete_empty_room_after_player_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.players WHERE players.room_id = OLD.room_id
  ) THEN
    DELETE FROM public.rooms WHERE rooms.id = OLD.room_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS delete_empty_room_after_player_leave ON public.players;
CREATE TRIGGER delete_empty_room_after_player_leave
AFTER DELETE ON public.players
FOR EACH ROW
EXECUTE FUNCTION public.delete_empty_room_after_player_leave();

-- ── Sweep out any orphan rooms that already accumulated ──────────────────────
-- One-time cleanup of rooms left behind before the fix above (no players left).
DELETE FROM public.rooms r
WHERE NOT EXISTS (SELECT 1 FROM public.players p WHERE p.room_id = r.id);
