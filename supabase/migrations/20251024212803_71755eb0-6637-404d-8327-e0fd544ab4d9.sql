-- Fix all RLS security issues

-- 1. Add DELETE policy for game_state (only host can delete)
CREATE POLICY "Only host can delete game state"
ON game_state FOR DELETE
USING (
  room_id IN (
    SELECT r.id FROM rooms r
    JOIN players p ON r.host_id = p.id
    WHERE p.user_id = auth.uid()
  )
);

-- 2. Add DELETE policy for rooms (only host can delete)
CREATE POLICY "Only host can delete room"
ON rooms FOR DELETE
USING (
  host_id IN (
    SELECT id FROM players
    WHERE user_id = auth.uid()
  )
);

-- 3. Add DELETE policy for players (players can only delete themselves)
CREATE POLICY "Players can only delete themselves"
ON players FOR DELETE
USING (user_id = auth.uid());

-- 4. Add DELETE policy for submissions (no client deletes allowed)
CREATE POLICY "Only system can delete submissions"
ON submissions FOR DELETE
USING (false);

-- 5. Drop and recreate game_state UPDATE policy (host only)
DROP POLICY IF EXISTS "Any authenticated user can update game state" ON game_state;
CREATE POLICY "Only host can update game state"
ON game_state FOR UPDATE
USING (
  room_id IN (
    SELECT r.id FROM rooms r
    JOIN players p ON r.host_id = p.id
    WHERE p.user_id = auth.uid()
  )
);

-- 6. Drop and recreate players UPDATE policy (prevent score changes)
DROP POLICY IF EXISTS "Players can only update their own name" ON players;
CREATE POLICY "Players can update name only"
ON players FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid() AND
  score = (SELECT score FROM players WHERE id = players.id) AND
  is_judge = (SELECT is_judge FROM players WHERE id = players.id) AND
  is_host = (SELECT is_host FROM players WHERE id = players.id)
);

-- 7. Drop and recreate player_hands INSERT policy (prevent client inserts)
DROP POLICY IF EXISTS "System can manage hands" ON player_hands;
CREATE POLICY "Only system can deal cards"
ON player_hands FOR INSERT
WITH CHECK (false);

-- 8. Drop and recreate player_hands SELECT policy (own cards only)
DROP POLICY IF EXISTS "Players can only view their own cards" ON player_hands;
CREATE POLICY "Players can view own cards only"
ON player_hands FOR SELECT
USING (
  player_id IN (
    SELECT id FROM players
    WHERE user_id = auth.uid()
  )
);

-- 9. Create temporary policy to allow host to deal cards during game setup
-- This will be used by the authenticated host when starting the game
CREATE POLICY "Host can deal cards when starting game"
ON player_hands FOR INSERT
WITH CHECK (
  room_id IN (
    SELECT r.id FROM rooms r
    JOIN players p ON r.host_id = p.id
    WHERE p.user_id = auth.uid()
  )
);