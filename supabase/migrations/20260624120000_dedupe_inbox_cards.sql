-- De-duplicate the round question (inbox card) within a single game.
--
-- Previously every round picked an inbox card with `ORDER BY random() LIMIT 1`
-- and no memory of what had already been shown, so the same question could come
-- up twice in one game — which feels broken to players. This migration tracks
-- the questions a game has already used and excludes them when picking the next
-- one, resetting (and allowing repeats) only once the whole pool is exhausted.
--
-- Touch points (the only three functions that choose an inbox card):
--   start_game_state — first question of a new game
--   rematch_game     — first question of a rematch (fresh pool)
--   resolve_round    — the question for each subsequent round
-- All three now go through the _next_inbox_card helper.

-- ── Track which questions a game has shown ───────────────────────────────────
ALTER TABLE public.game_state
  ADD COLUMN IF NOT EXISTS used_inbox_ids uuid[] NOT NULL DEFAULT '{}';

-- ── Helper: pick the next question, skipping ones already used this game ──────
-- Returns a random inbox card for the pack that isn't in p_used. If every
-- matching card has been used (pool exhausted), it falls back to a fully random
-- pick so the game can keep going — callers detect that case (the returned id is
-- already in p_used) and reset the used list. Internal: callers are all
-- SECURITY DEFINER, so this never needs to be reachable by clients.
CREATE OR REPLACE FUNCTION public._next_inbox_card(p_pack text, p_used uuid[])
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM cards
  WHERE type = 'inbox'
    AND (p_pack IS NULL OR category = p_pack)
    AND NOT (id = ANY (COALESCE(p_used, '{}'::uuid[])))
  ORDER BY random()
  LIMIT 1;

  IF v_id IS NULL THEN
    -- Pool exhausted (or the exclusion left nothing): allow repeats.
    SELECT id INTO v_id
    FROM cards
    WHERE type = 'inbox'
      AND (p_pack IS NULL OR category = p_pack)
    ORDER BY random()
    LIMIT 1;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public._next_inbox_card(text, uuid[]) FROM PUBLIC, anon, authenticated;

-- ── start_game_state: seed the used list with the opening question ───────────
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

  v_inbox := _next_inbox_card(p_pack, '{}'::uuid[]);

  INSERT INTO game_state (
    room_id, current_judge_id, current_inbox_card_id,
    round_number, phase, max_rounds, pack, phase_deadline, used_inbox_ids
  )
  VALUES (
    p_room_id, v_judge, v_inbox,
    1, 'submitting', p_max_rounds, p_pack, now() + interval '60 seconds',
    CASE WHEN v_inbox IS NULL THEN '{}'::uuid[] ELSE ARRAY[v_inbox] END
  )
  RETURNING * INTO v_gs;

  PERFORM deal_initial_cards(p_room_id);

  RETURN v_gs;
END;
$$;

-- ── rematch_game: a rematch is a fresh game, so reset the used pool ───────────
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

  v_inbox := _next_inbox_card(v_pack, '{}'::uuid[]);

  PERFORM deal_initial_cards(p_room_id);

  UPDATE game_state
  SET round_number = 1,
      phase = 'submitting',
      current_inbox_card_id = COALESCE(v_inbox, current_inbox_card_id),
      used_inbox_ids = CASE WHEN v_inbox IS NULL THEN '{}'::uuid[] ELSE ARRAY[v_inbox] END,
      winner_name = NULL,
      winner_score = NULL,
      phase_deadline = now() + interval '60 seconds'
  WHERE room_id = p_room_id;

  UPDATE rooms SET status = 'playing' WHERE id = p_room_id;
END;
$$;

-- ── resolve_round: exclude used questions when advancing to the next round ────
-- Reproduces the resolve_round from 20260610140000_round_winner_overlay_payload
-- verbatim except the next-round question pick, which now uses _next_inbox_card
-- and records the choice in used_inbox_ids (resetting the list when the pool is
-- exhausted — detected by the picked id already being in the used list).
CREATE OR REPLACE FUNCTION public.resolve_round(p_room_id uuid, p_submission_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gs game_state%ROWTYPE;
  v_sub_id uuid;
  v_player_id uuid;
  v_player_name text;
  v_card_text text;
  v_top_score int;
  v_winner_name text;
  v_inbox uuid;
BEGIN
  -- Lock the game row: concurrent resolvers (judge tap, watchdog, client
  -- fallbacks) queue here, and whoever runs second sees the advanced phase
  -- and returns without doing anything.
  SELECT * INTO gs FROM game_state WHERE room_id = p_room_id FOR UPDATE;
  IF NOT FOUND OR gs.winner_name IS NOT NULL OR gs.phase <> 'judging' THEN
    RETURN;
  END IF;

  IF p_submission_id IS NULL THEN
    -- Random pick is only legitimate once the judging deadline has expired.
    IF gs.phase_deadline IS NULL OR gs.phase_deadline > now() THEN
      RETURN;
    END IF;
  ELSE
    -- Manual pick: the caller must be the room's judge. Watchdog/cron calls
    -- have no auth context and never pass a submission id.
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM players
      WHERE room_id = p_room_id AND user_id = auth.uid() AND is_judge = true
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- Winner is identified by submission id (blank cards share one card_id).
  IF p_submission_id IS NOT NULL THEN
    SELECT s.id, s.player_id INTO v_sub_id, v_player_id
    FROM submissions s
    WHERE s.id = p_submission_id
      AND s.room_id = p_room_id
      AND s.round_number = gs.round_number;
  END IF;

  IF v_sub_id IS NULL THEN
    SELECT s.id, s.player_id INTO v_sub_id, v_player_id
    FROM submissions s
    WHERE s.room_id = p_room_id AND s.round_number = gs.round_number
    ORDER BY random()
    LIMIT 1;
  END IF;

  IF v_sub_id IS NOT NULL THEN
    UPDATE submissions SET is_winner = true WHERE id = v_sub_id;
    UPDATE players SET score = score + 1 WHERE id = v_player_id;
    SELECT name INTO v_player_name FROM players WHERE id = v_player_id;

    SELECT COALESCE(s.custom_text, c.text_ge) INTO v_card_text
    FROM submissions s
    LEFT JOIN cards c ON c.id = s.card_id
    WHERE s.id = v_sub_id;

    -- Round-winner overlay on every client. Delivery failure must never roll
    -- back the resolution itself.
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object(
          'winnerName', v_player_name,
          'winnerPlayerId', v_player_id,
          'cardText', v_card_text
        ),
        'round_winner',
        'submissions_' || p_room_id::text,
        false
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  DELETE FROM submissions
  WHERE room_id = p_room_id AND round_number = gs.round_number;

  IF gs.round_number >= gs.max_rounds THEN
    SELECT score INTO v_top_score
    FROM players
    WHERE room_id = p_room_id AND in_game = true
    ORDER BY score DESC
    LIMIT 1;

    SELECT string_agg(name, ', ' ORDER BY joined_at) INTO v_winner_name
    FROM players
    WHERE room_id = p_room_id AND in_game = true AND score = v_top_score;

    UPDATE game_state
    SET winner_name = v_winner_name,
        winner_score = v_top_score,
        phase_deadline = NULL
    WHERE room_id = p_room_id;

    UPDATE rooms SET status = 'finished' WHERE id = p_room_id;
  ELSE
    -- Next question, skipping ones already shown this game.
    v_inbox := _next_inbox_card(gs.pack, gs.used_inbox_ids);

    PERFORM deal_one_card(p_room_id);

    UPDATE game_state
    SET phase = 'submitting',
        current_inbox_card_id = COALESCE(v_inbox, gs.current_inbox_card_id),
        used_inbox_ids = CASE
          WHEN v_inbox IS NULL THEN gs.used_inbox_ids
          -- A normal pick excludes used ids, so a returned id that IS already in
          -- the list means the pool was exhausted and reset — start fresh.
          WHEN v_inbox = ANY (gs.used_inbox_ids) THEN ARRAY[v_inbox]
          ELSE gs.used_inbox_ids || v_inbox
        END,
        round_number = gs.round_number + 1,
        phase_deadline = now() + interval '60 seconds'
    WHERE room_id = p_room_id;
  END IF;
END;
$$;
