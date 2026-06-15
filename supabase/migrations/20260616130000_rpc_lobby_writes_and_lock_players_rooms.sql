-- Finish the RLS lockdown: make `players` and `rooms` read-only to clients too.
-- All remaining client writes (create a room, join a room, leave a room incl.
-- host reassignment and mid-game teardown) move into SECURITY DEFINER RPCs that
-- enforce the rules server-side. After this, a player with devtools can no
-- longer set their own score, flip their judge/host flag, or tamper with
-- another player's row — every table in the game is read-only and writes only
-- happen through validated RPCs.

-- ── Create a room + its host player ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_room(
  p_player_name text,
  p_is_judge boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pin text;
  v_room_id uuid;
  v_player_id uuid;
  v_attempts int := 0;
  i int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF btrim(coalesce(p_player_name, '')) = '' THEN
    RAISE EXCEPTION 'name required';
  END IF;

  -- Generate a unique 6-char uppercase base-36 PIN, retrying on collision.
  LOOP
    v_attempts := v_attempts + 1;
    v_pin := '';
    FOR i IN 1..6 LOOP
      v_pin := v_pin || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 1 + floor(random() * 36)::int, 1);
    END LOOP;

    BEGIN
      INSERT INTO rooms (pin, status) VALUES (v_pin, 'lobby')
      RETURNING id INTO v_room_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempts >= 10 THEN
        RAISE EXCEPTION 'could not generate a unique pin';
      END IF;
    END;
  END LOOP;

  INSERT INTO players (room_id, name, is_host, is_judge, user_id)
  VALUES (v_room_id, btrim(p_player_name), true, p_is_judge, v_uid)
  RETURNING id INTO v_player_id;

  UPDATE rooms SET host_id = v_player_id WHERE id = v_room_id;

  RETURN jsonb_build_object('room_id', v_room_id, 'player_id', v_player_id, 'pin', v_pin);
END;
$$;

-- ── Join an existing room ────────────────────────────────────────────────────
-- Returns { ok, reason?, room_id?, player_id? }. The count/judge checks run
-- under a room row lock so two simultaneous joins can't both take the last seat
-- or the judge slot.
CREATE OR REPLACE FUNCTION public.join_room(
  p_pin text,
  p_player_name text,
  p_is_judge boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room rooms%ROWTYPE;
  v_count int;
  v_player_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF btrim(coalesce(p_player_name, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_room FROM rooms WHERE pin = upper(btrim(p_pin)) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_room.status <> 'lobby' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'started');
  END IF;

  SELECT count(*) INTO v_count FROM players WHERE room_id = v_room.id;
  IF v_count >= 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'full');
  END IF;

  IF p_is_judge AND EXISTS (
    SELECT 1 FROM players WHERE room_id = v_room.id AND is_judge = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'judge_taken');
  END IF;

  INSERT INTO players (room_id, name, is_host, is_judge, user_id)
  VALUES (v_room.id, btrim(p_player_name), false, p_is_judge, v_uid)
  RETURNING id INTO v_player_id;

  RETURN jsonb_build_object('ok', true, 'room_id', v_room.id, 'player_id', v_player_id);
END;
$$;

-- ── Leave a room ─────────────────────────────────────────────────────────────
-- Deletes the player (the delete_empty_room_after_player_leave trigger drops the
-- room if it was the last one), tears the game back to the lobby when the judge
-- leaves or too few comedians remain, and reassigns the host if the host left.
-- Returns flags so the client knows whether to broadcast a return-to-lobby.
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
  v_was_host boolean;
  v_was_judge boolean;
  v_status text;
  v_remaining int;
  v_remaining_comedians int;
  v_returned boolean := false;
  v_reason text := NULL;
  v_new_host uuid;
BEGIN
  -- The player being removed must belong to the caller's session.
  IF v_uid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM players WHERE id = p_player_id AND user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  SELECT is_host, is_judge INTO v_was_host, v_was_judge
  FROM players WHERE id = p_player_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'room_deleted', false);
  END IF;

  SELECT status INTO v_status FROM rooms WHERE id = p_room_id;

  DELETE FROM players WHERE id = p_player_id;

  SELECT count(*) INTO v_remaining FROM players WHERE room_id = p_room_id;
  IF v_remaining = 0 THEN
    -- The AFTER DELETE trigger has already removed the now-empty room.
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

-- ── Make players and rooms read-only to clients ──────────────────────────────
-- Drop every write policy accumulated across earlier migrations. The SELECT
-- policies ("Anyone can view ...") stay so realtime keeps streaming.

DROP POLICY IF EXISTS "Anyone can join as player" ON public.players;
DROP POLICY IF EXISTS "Players can update themselves" ON public.players;
DROP POLICY IF EXISTS "Players can update their name" ON public.players;
DROP POLICY IF EXISTS "Players can update name only" ON public.players;
DROP POLICY IF EXISTS "System can update player scores and judge status" ON public.players;
DROP POLICY IF EXISTS "Players can leave rooms" ON public.players;

DROP POLICY IF EXISTS "Anyone can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Host can update room" ON public.rooms;
DROP POLICY IF EXISTS "Creator can update room to set host" ON public.rooms;
DROP POLICY IF EXISTS "Host can update their room" ON public.rooms;
DROP POLICY IF EXISTS "Host can delete room or delete if empty" ON public.rooms;
DROP POLICY IF EXISTS "Only host can delete room" ON public.rooms;
