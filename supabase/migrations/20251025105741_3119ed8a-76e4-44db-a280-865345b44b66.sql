-- Fix RLS policy for game_state to allow phase updates
DROP POLICY IF EXISTS "Players in room can update phase" ON game_state;

CREATE POLICY "Players in room can update game state"
ON game_state
FOR UPDATE
USING (
  room_id IN (
    SELECT room_id FROM players WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  room_id IN (
    SELECT room_id FROM players WHERE user_id = auth.uid()
  )
);