-- Allow players in room to update only the phase field in game_state
DROP POLICY IF EXISTS "Only host can update game state" ON game_state;

CREATE POLICY "Players in room can update phase"
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
  -- Ensure only phase can be changed, other fields remain the same
  AND current_judge_id = (SELECT current_judge_id FROM game_state WHERE game_state.room_id = game_state.room_id)
  AND current_inbox_card_id = (SELECT current_inbox_card_id FROM game_state WHERE game_state.room_id = game_state.room_id)
  AND round_number = (SELECT round_number FROM game_state WHERE game_state.room_id = game_state.room_id)
  AND max_rounds = (SELECT max_rounds FROM game_state WHERE game_state.room_id = game_state.room_id)
);