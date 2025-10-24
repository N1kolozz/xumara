-- Fix game_state RLS policy to allow any authenticated user to create it
-- The host check will be done at application level
DROP POLICY IF EXISTS "Host can create game state" ON public.game_state;

CREATE POLICY "Any authenticated user can create game state"
ON public.game_state FOR INSERT
TO authenticated
WITH CHECK (true);

-- Fix game_state update policy similarly
DROP POLICY IF EXISTS "Host can update game state" ON public.game_state;

CREATE POLICY "Any authenticated user can update game state"
ON public.game_state FOR UPDATE
TO authenticated
USING (true);