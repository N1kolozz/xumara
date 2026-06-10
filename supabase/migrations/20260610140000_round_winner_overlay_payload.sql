-- Enrich the round_winner broadcast with the winning card's text and the
-- winner's player id, so clients can show a winner overlay (card + name) and
-- give the winning player stronger haptic feedback. Identical to the previous
-- resolve_round except for the broadcast block.

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
    SELECT id INTO v_inbox
    FROM cards
    WHERE type = 'inbox'
      AND (gs.pack IS NULL OR category = gs.pack)
    ORDER BY random()
    LIMIT 1;

    PERFORM deal_one_card(p_room_id);

    UPDATE game_state
    SET phase = 'submitting',
        current_inbox_card_id = COALESCE(v_inbox, gs.current_inbox_card_id),
        round_number = gs.round_number + 1,
        phase_deadline = now() + interval '60 seconds'
    WHERE room_id = p_room_id;
  END IF;
END;
$$;
