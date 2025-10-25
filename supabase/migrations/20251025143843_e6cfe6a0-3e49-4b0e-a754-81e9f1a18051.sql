-- Drop existing restrictive UPDATE policy
DROP POLICY IF EXISTS "Players can update name only" ON players;

-- Create new policy that allows players to update their name
CREATE POLICY "Players can update their name"
ON players
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid() AND
  -- Only name can be changed by player
  is_judge = (SELECT is_judge FROM players WHERE id = players.id) AND
  is_host = (SELECT is_host FROM players WHERE id = players.id)
);

-- Create policy to allow system to update scores and judge status
CREATE POLICY "System can update player scores and judge status"
ON players
FOR UPDATE
USING (true)
WITH CHECK (true);