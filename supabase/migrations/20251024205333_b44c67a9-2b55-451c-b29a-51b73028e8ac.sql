-- Add user_id column to players table to link to auth.users
ALTER TABLE public.players 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update RLS policies for players table
DROP POLICY IF EXISTS "Anyone can join as player" ON public.players;
DROP POLICY IF EXISTS "Anyone can view players" ON public.players;
DROP POLICY IF EXISTS "Players can update themselves" ON public.players;

CREATE POLICY "Authenticated users can join as player"
ON public.players FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone in room can view players"
ON public.players FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Players can only update their own name"
ON public.players FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id AND
  -- Prevent updating score, is_judge, is_host directly
  score = (SELECT score FROM players WHERE id = players.id) AND
  is_judge = (SELECT is_judge FROM players WHERE id = players.id) AND
  is_host = (SELECT is_host FROM players WHERE id = players.id)
);

-- Update RLS policies for player_hands table
DROP POLICY IF EXISTS "Anyone can manage hands" ON public.player_hands;
DROP POLICY IF EXISTS "Anyone can view hands" ON public.player_hands;
DROP POLICY IF EXISTS "Anyone can delete from hands" ON public.player_hands;

CREATE POLICY "Players can only view their own cards"
ON public.player_hands FOR SELECT
TO authenticated
USING (
  player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
);

CREATE POLICY "System can manage hands"
ON public.player_hands FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "System can delete hands"
ON public.player_hands FOR DELETE
TO authenticated
USING (true);

-- Update RLS policies for game_state table
DROP POLICY IF EXISTS "Anyone can create game state" ON public.game_state;
DROP POLICY IF EXISTS "Anyone can update game state" ON public.game_state;
DROP POLICY IF EXISTS "Anyone can view game state" ON public.game_state;

CREATE POLICY "Host can create game state"
ON public.game_state FOR INSERT
TO authenticated
WITH CHECK (
  room_id IN (SELECT id FROM rooms WHERE host_id IN (SELECT id FROM players WHERE user_id = auth.uid()))
);

CREATE POLICY "Players can view game state"
ON public.game_state FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Host can update game state"
ON public.game_state FOR UPDATE
TO authenticated
USING (
  room_id IN (SELECT id FROM rooms WHERE host_id IN (SELECT id FROM players WHERE user_id = auth.uid()))
);

-- Update RLS policies for submissions table
DROP POLICY IF EXISTS "Anyone can create submissions" ON public.submissions;
DROP POLICY IF EXISTS "Anyone can update submissions" ON public.submissions;
DROP POLICY IF EXISTS "Anyone can view submissions" ON public.submissions;

CREATE POLICY "Players can create their own submissions"
ON public.submissions FOR INSERT
TO authenticated
WITH CHECK (
  player_id IN (SELECT id FROM players WHERE user_id = auth.uid())
);

CREATE POLICY "Players can view submissions in their room"
ON public.submissions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Only judge can mark winners"
ON public.submissions FOR UPDATE
TO authenticated
USING (
  room_id IN (
    SELECT room_id FROM players 
    WHERE user_id = auth.uid() AND is_judge = true
  )
)
WITH CHECK (
  -- Only allow updating is_winner field
  player_id = (SELECT player_id FROM submissions WHERE id = submissions.id) AND
  card_id = (SELECT card_id FROM submissions WHERE id = submissions.id) AND
  round_number = (SELECT round_number FROM submissions WHERE id = submissions.id)
);

-- Update RLS policies for rooms table
DROP POLICY IF EXISTS "Anyone can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can view rooms" ON public.rooms;
DROP POLICY IF EXISTS "Host can update room" ON public.rooms;

CREATE POLICY "Authenticated users can create rooms"
ON public.rooms FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Players can view their rooms"
ON public.rooms FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Host can update their room"
ON public.rooms FOR UPDATE
TO authenticated
USING (
  host_id IN (SELECT id FROM players WHERE user_id = auth.uid())
);