-- Lock down the two gameplay tables (game_state, submissions) so clients can
-- only READ them. Every client-initiated write now goes through a
-- SECURITY DEFINER RPC that enforces the rules server-side:
--
--   submit_card          — insert a submission + draw it out of the hand, and
--                          flip submitting -> revealing once everyone's in.
--   start_game_state     — host starts a game (creates game_state, deals).
--   rematch_game         — host restarts the same room.
--   reset_room_to_lobby  — tear a game down and send the room back to the lobby.
--   leave_game_round     — a single player drops out of an in-progress round.
--
-- Winner picking (resolve_round) and phase expiry (resolve_room_phase) already
-- run as RPCs. After this migration a player with devtools can no longer forge
-- a submission, skip the phase, or wipe another room's state — the tables are
-- read-only and the RPCs validate the caller. (Scores live on `players`, which
-- stays writable for now; locking that down is a separate, larger change.)

-- ── Reply-card submission ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_card(
  p_room_id uuid,
  p_player_id uuid,
  p_card_id uuid,
  p_round_number int,
  p_custom_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Seeded blank "write-your-own" card (mirrors BLANK_CARD_ID in gameConfig.ts).
  v_blank_id constant uuid := '00000000-0000-0000-0000-000000000b1a';
  v_is_blank boolean := (p_card_id = v_blank_id);
  v_text text := NULLIF(btrim(p_custom_text), '');
  v_ins uuid;
  v_non_judge int;
  v_sub_count int;
BEGIN
  -- The submitting player must belong to the caller's session.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM players
    WHERE id = p_player_id AND room_id = p_room_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'forbidden');
  END IF;

  -- A blank card is meaningless without text.
  IF v_is_blank AND v_text IS NULL THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'empty');
  END IF;

  -- Only accept a submission for the round that's actually open.
  IF NOT EXISTS (
    SELECT 1 FROM game_state
    WHERE room_id = p_room_id
      AND phase = 'submitting'
      AND round_number = p_round_number
  ) THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'closed');
  END IF;

  -- The unique index (room_id, round_number, player_id) makes a double-tap or a
  -- slow submit racing the auto-resolve lose gracefully.
  INSERT INTO submissions (room_id, player_id, card_id, round_number, custom_text)
  VALUES (
    p_room_id, p_player_id, p_card_id, p_round_number,
    CASE WHEN v_is_blank THEN v_text ELSE NULL END
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_ins;

  IF v_ins IS NULL THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'duplicate');
  END IF;

  -- The blank is a permanent UI card; only real cards leave the hand.
  IF NOT v_is_blank THEN
    UPDATE players SET hand = array_remove(hand, p_card_id) WHERE id = p_player_id;
  END IF;

  -- Advance to revealing the moment the last non-judge player submits, instead
  -- of waiting for the deadline. Reveal pacing mirrors revealDurationMs
  -- (0.7s base + 0.85s/card).
  SELECT count(*) INTO v_non_judge
  FROM players
  WHERE room_id = p_room_id AND is_judge = false AND in_game = true;

  SELECT count(*) INTO v_sub_count
  FROM submissions
  WHERE room_id = p_room_id AND round_number = p_round_number;

  IF v_sub_count >= v_non_judge THEN
    UPDATE game_state
    SET phase = 'revealing',
        phase_deadline = now() + make_interval(secs => 0.7 + 0.85 * v_sub_count)
    WHERE room_id = p_room_id
      AND phase = 'submitting'
      AND round_number = p_round_number;
  END IF;

  RETURN jsonb_build_object('inserted', true);
END;
$$;

-- ── Host starts a game ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_game_state(
  p_room_id uuid,
  p_max_rounds int,
  p_pack text DEFAULT NULL
)
RETURNS game_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_judge uuid;
  v_inbox uuid;
  v_gs game_state;
BEGIN
  -- Only the room's host may start the game.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM rooms r JOIN players p ON r.host_id = p.id
    WHERE r.id = p_room_id AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'only the host can start the game';
  END IF;

  -- Already started: return the existing row, leaving the game untouched.
  SELECT * INTO v_gs FROM game_state WHERE room_id = p_room_id;
  IF FOUND THEN
    RETURN v_gs;
  END IF;

  DELETE FROM submissions WHERE room_id = p_room_id;
  PERFORM clear_room_hands(p_room_id);
  UPDATE players SET score = 0, in_game = true WHERE room_id = p_room_id;
  UPDATE rooms SET status = 'playing' WHERE id = p_room_id;

  SELECT id INTO v_judge
  FROM players
  WHERE room_id = p_room_id AND is_judge = true
  ORDER BY joined_at
  LIMIT 1;
  IF v_judge IS NULL THEN
    SELECT id INTO v_judge FROM players WHERE room_id = p_room_id ORDER BY joined_at LIMIT 1;
  END IF;

  SELECT id INTO v_inbox
  FROM cards
  WHERE type = 'inbox' AND (p_pack IS NULL OR category = p_pack)
  ORDER BY random()
  LIMIT 1;

  INSERT INTO game_state (
    room_id, current_judge_id, current_inbox_card_id,
    round_number, phase, max_rounds, pack, phase_deadline
  )
  VALUES (
    p_room_id, v_judge, v_inbox,
    1, 'submitting', p_max_rounds, p_pack, now() + interval '60 seconds'
  )
  RETURNING * INTO v_gs;

  PERFORM deal_initial_cards(p_room_id);

  RETURN v_gs;
END;
$$;

-- ── Host restarts the same room (rematch) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rematch_game(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pack text;
  v_inbox uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM rooms r JOIN players p ON r.host_id = p.id
    WHERE r.id = p_room_id AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'only the host can restart the game';
  END IF;

  SELECT pack INTO v_pack FROM game_state WHERE room_id = p_room_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  DELETE FROM submissions WHERE room_id = p_room_id;
  PERFORM clear_room_hands(p_room_id);
  UPDATE players SET score = 0, in_game = true WHERE room_id = p_room_id;

  SELECT id INTO v_inbox
  FROM cards
  WHERE type = 'inbox' AND (v_pack IS NULL OR category = v_pack)
  ORDER BY random()
  LIMIT 1;

  PERFORM deal_initial_cards(p_room_id);

  UPDATE game_state
  SET round_number = 1,
      phase = 'submitting',
      current_inbox_card_id = COALESCE(v_inbox, current_inbox_card_id),
      winner_name = NULL,
      winner_score = NULL,
      phase_deadline = now() + interval '60 seconds'
  WHERE room_id = p_room_id;

  UPDATE rooms SET status = 'playing' WHERE id = p_room_id;
END;
$$;

-- ── Tear a game down, back to the lobby ──────────────────────────────────────
-- p_reset_scores: true for a full reset (game finished / end-to-lobby), false
-- when a departing judge or too-few-players sends everyone back mid-game.
CREATE OR REPLACE FUNCTION public.reset_room_to_lobby(
  p_room_id uuid,
  p_reset_scores boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM game_state WHERE room_id = p_room_id;
  DELETE FROM submissions WHERE room_id = p_room_id;
  PERFORM clear_room_hands(p_room_id);
  IF p_reset_scores THEN
    UPDATE players SET in_game = false, score = 0 WHERE room_id = p_room_id;
  ELSE
    UPDATE players SET in_game = false WHERE room_id = p_room_id;
  END IF;
  UPDATE rooms SET status = 'lobby' WHERE id = p_room_id;
END;
$$;

-- ── A single player drops out of an in-progress round ────────────────────────
CREATE OR REPLACE FUNCTION public.leave_game_round(
  p_room_id uuid,
  p_player_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM players WHERE id = p_player_id AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;
  UPDATE players SET in_game = false, hand = '{}' WHERE id = p_player_id;
  DELETE FROM submissions WHERE room_id = p_room_id AND player_id = p_player_id;
END;
$$;

-- ── Make game_state and submissions read-only to clients ─────────────────────
-- Drop every write policy (INSERT/UPDATE/DELETE) accumulated across earlier
-- migrations. The SELECT policies ("Anyone can view ...") stay, so realtime
-- still streams every change to all clients.

DROP POLICY IF EXISTS "Anyone can update game state" ON public.game_state;
DROP POLICY IF EXISTS "Anyone can create game state" ON public.game_state;
DROP POLICY IF EXISTS "Players in room can update game state" ON public.game_state;
DROP POLICY IF EXISTS "Players in room can update phase" ON public.game_state;
DROP POLICY IF EXISTS "Players in room can create game state" ON public.game_state;
DROP POLICY IF EXISTS "Host can create game state" ON public.game_state;
DROP POLICY IF EXISTS "Only host can update game state" ON public.game_state;

DROP POLICY IF EXISTS "Anyone can create submissions" ON public.submissions;
DROP POLICY IF EXISTS "Anyone can update submissions" ON public.submissions;
DROP POLICY IF EXISTS "Players in room can delete submissions" ON public.submissions;
DROP POLICY IF EXISTS "Only system can delete submissions" ON public.submissions;
