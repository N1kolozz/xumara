-- Add columns to store game winner information temporarily
ALTER TABLE public.game_state
ADD COLUMN winner_name TEXT,
ADD COLUMN winner_score INTEGER;