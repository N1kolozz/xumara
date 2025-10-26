-- Fix the default value for in_game column in players table
-- Players should start with in_game=false by default, not true
ALTER TABLE public.players 
ALTER COLUMN in_game SET DEFAULT false;