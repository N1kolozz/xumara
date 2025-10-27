-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Only host can delete room" ON rooms;

-- Create new policy that allows deletion by host OR when no players remain
CREATE POLICY "Host can delete room or delete if empty"
ON rooms
FOR DELETE
USING (
  -- Allow host to delete
  host_id IN (
    SELECT players.id 
    FROM players 
    WHERE players.user_id = auth.uid()
  )
  OR
  -- Allow deletion if no players remain in the room
  NOT EXISTS (
    SELECT 1 
    FROM players 
    WHERE players.room_id = rooms.id
  )
);