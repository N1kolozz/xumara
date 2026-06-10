-- Server-authoritative phase advancement.
--
-- Previously only the judge's client advanced expired phases with setTimeout.
-- Mobile browsers suspend timers in background tabs, so the whole room froze
-- whenever the judge locked their phone. This migration moves all expiry
-- handling and the entire round resolution into the database:
--
--   * resolve_round(room, submission?)  — atomic winner pick + scoring +
--     round advance / game finish, in one transaction. Called by the judge's
--     client for a manual pick and by the watchdog for an expired judging
--     phase (random pick).
--   * resolve_room_phase(room)          — handles an expired deadline for any
--     phase. Safe to call from any client at any time: it no-ops unless the
--     deadline has truly passed, and a row lock serializes concurrent callers.
--   * resolve_expired_phases()          — pg_cron entry point, sweeps all
--     active games every 5 seconds.
--
-- Timer durations mirror src/lib/gameConfig.ts (SUBMIT_MS=60s, JUDGE_MS=40s,
-- reveal = 0.7s + 0.85s/card). Keep them in sync.

-- ── Atomic round resolution ──────────────────────────────────────────────────
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

    -- Round-winner toast on every client. Delivery failure must never roll
    -- back the resolution itself.
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('winnerName', v_player_name),
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

-- ── Expired-deadline handler for a single room ───────────────────────────────
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
        phase_deadline = now() + interval '40 seconds'
    WHERE room_id = p_room_id AND phase = 'revealing' AND round_number = gs.round_number;

  ELSIF gs.phase = 'judging' THEN
    PERFORM resolve_round(p_room_id, NULL);
  END IF;
END;
$$;

-- ── Watchdog sweep (pg_cron entry point) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_expired_phases()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT room_id FROM game_state
    WHERE winner_name IS NULL
      AND phase_deadline IS NOT NULL
      AND phase_deadline < now() - interval '1 second'
      AND phase IN ('submitting', 'revealing', 'judging')
  LOOP
    BEGIN
      PERFORM resolve_room_phase(r.room_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'resolve_room_phase failed for room %: %', r.room_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ── Schedule the watchdog every 5 seconds ────────────────────────────────────
-- cron.schedule upserts by job name, so re-running this migration is safe.
-- If pg_cron isn't available (e.g. plain local Postgres), skip with a warning:
-- the client-side fallback timers still advance the game.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'xumara-phase-watchdog',
    '5 seconds',
    'SELECT public.resolve_expired_phases()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pg_cron unavailable, phase watchdog not scheduled: %', SQLERRM;
END;
$$;
