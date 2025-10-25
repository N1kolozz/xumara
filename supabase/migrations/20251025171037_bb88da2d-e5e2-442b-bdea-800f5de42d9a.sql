-- Drop the restrictive delete policy on submissions
DROP POLICY IF EXISTS "Only system can delete submissions" ON public.submissions;

-- Create new policy allowing players in the room to delete submissions
CREATE POLICY "Players in room can delete submissions"
ON public.submissions
FOR DELETE
USING (
  room_id IN (
    SELECT room_id 
    FROM players 
    WHERE user_id = auth.uid()
  )
);