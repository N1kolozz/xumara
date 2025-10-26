-- Add in_game column to players table to track if player is actively in current game
ALTER TABLE public.players 
ADD COLUMN in_game BOOLEAN NOT NULL DEFAULT true;

-- Add comment for clarity
COMMENT ON COLUMN public.players.in_game IS 'Indicates if player is actively participating in the current game session';