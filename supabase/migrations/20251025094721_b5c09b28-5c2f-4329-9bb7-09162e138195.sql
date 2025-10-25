-- Fix player_hands INSERT policy to allow host to deal cards
DROP POLICY IF EXISTS "Host can deal cards when starting game" ON player_hands;

CREATE POLICY "Host can deal cards when starting game"
ON player_hands FOR INSERT
WITH CHECK (
  room_id IN (
    SELECT r.id 
    FROM rooms r
    JOIN players p ON r.host_id = p.id
    WHERE p.user_id = auth.uid()
  )
);

-- Fix game_state INSERT policy to ensure it works for authenticated users
DROP POLICY IF EXISTS "Any authenticated user can create game state" ON game_state;

CREATE POLICY "Host can create game state"
ON game_state FOR INSERT
WITH CHECK (
  room_id IN (
    SELECT r.id 
    FROM rooms r
    JOIN players p ON r.host_id = p.id
    WHERE p.user_id = auth.uid()
  )
);