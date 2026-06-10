-- Fix round-resolution races:
-- 1. Enforce one submission per player per round, so a laggy double-tap or the
--    auto-resolve timer racing a slow manual submit can't insert duplicates.
-- 2. Atomic score increment so the winner's score is never computed from a
--    stale client-side value.

-- Submissions are deleted after every round, so the index applies cleanly to
-- existing data.
CREATE UNIQUE INDEX IF NOT EXISTS submissions_one_per_player_per_round
  ON public.submissions (room_id, round_number, player_id);

CREATE OR REPLACE FUNCTION public.increment_player_score(p_player_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE players SET score = score + 1 WHERE id = p_player_id;
$$;
