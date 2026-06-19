-- Extend the judging phase from 40s to 60s so the judge has a full minute to
-- pick the funniest answer. The duration is mirrored in src/lib/gameConfig.ts
-- (JUDGE_MS=60s) — keep the two in sync.
--
-- This supersedes the interval '40 seconds' set when resolve_room_phase was
-- introduced in 20260610130000_server_phase_watchdog.sql. We CREATE OR REPLACE
-- the whole function (rather than edit the historical migration) so already
-- deployed databases pick up the new timer. Only the revealing→judging deadline
-- changed below; everything else is reproduced verbatim.
CREATE OR REPLACE FUNCTION public.resolve_room_phase(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gs game_state%ROWTYPE;
  missing RECORD;
  v_card uuid;
  v_ins uuid;
  sub_count int;
BEGIN
  SELECT * INTO gs FROM game_state WHERE room_id = p_room_id FOR UPDATE;
  IF NOT FOUND OR gs.winner_name IS NOT NULL THEN
    RETURN;
  END IF;
  IF gs.phase_deadline IS NULL OR gs.phase_deadline > now() THEN
    RETURN;
  END IF;

  IF gs.phase = 'submitting' THEN
    -- Auto-play a random hand card for everyone who didn't choose in time.
    FOR missing IN
      SELECT p.id, p.hand
      FROM players p
      WHERE p.room_id = p_room_id
        AND p.is_judge = false
        AND p.in_game = true
        AND NOT EXISTS (
          SELECT 1 FROM submissions s
          WHERE s.room_id = p_room_id
            AND s.round_number = gs.round_number
            AND s.player_id = p.id
        )
    LOOP
      IF missing.hand IS NULL OR cardinality(missing.hand) = 0 THEN
        CONTINUE;
      END IF;
      v_card := missing.hand[1 + floor(random() * cardinality(missing.hand))::int];

      -- The unique index makes this lose gracefully to a slow manual submit;
      -- only touch the hand when our insert actually landed.
      INSERT INTO submissions (room_id, player_id, card_id, round_number)
      VALUES (p_room_id, missing.id, v_card, gs.round_number)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_ins;

      IF v_ins IS NOT NULL THEN
        UPDATE players SET hand = array_remove(hand, v_card) WHERE id = missing.id;
      END IF;
    END LOOP;

    SELECT count(*) INTO sub_count
    FROM submissions
    WHERE room_id = p_room_id AND round_number = gs.round_number;

    -- Reveal pacing: 0.7s base + 0.85s per card (mirrors revealDurationMs).
    UPDATE game_state
    SET phase = 'revealing',
        phase_deadline = now() + make_interval(secs => 0.7 + 0.85 * sub_count)
    WHERE room_id = p_room_id AND phase = 'submitting' AND round_number = gs.round_number;

  ELSIF gs.phase = 'revealing' THEN
    UPDATE game_state
    SET phase = 'judging',
        phase_deadline = now() + interval '60 seconds'
    WHERE room_id = p_room_id AND phase = 'revealing' AND round_number = gs.round_number;

  ELSIF gs.phase = 'judging' THEN
    PERFORM resolve_round(p_room_id, NULL);
  END IF;
END;
$$;
