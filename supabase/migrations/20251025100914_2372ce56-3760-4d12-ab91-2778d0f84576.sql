-- Allow authenticated users to create rooms (they will set host_id after creating player)
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON rooms;

CREATE POLICY "Authenticated users can create rooms"
ON rooms FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Allow room creator to update host_id
DROP POLICY IF EXISTS "Host can update their room" ON rooms;

CREATE POLICY "Creator can update room to set host"
ON rooms FOR UPDATE
USING (
  -- Allow if user created a player in this room
  id IN (
    SELECT room_id FROM players WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  -- Allow if user created a player in this room
  id IN (
    SELECT room_id FROM players WHERE user_id = auth.uid()
  )
);

-- Simplify game_state INSERT policy - allow any player in the room to create game state
DROP POLICY IF EXISTS "Host can create game state" ON game_state;

CREATE POLICY "Players in room can create game state"
ON game_state FOR INSERT
WITH CHECK (
  room_id IN (
    SELECT room_id FROM players WHERE user_id = auth.uid()
  )
);