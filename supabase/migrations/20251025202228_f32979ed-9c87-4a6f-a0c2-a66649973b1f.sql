-- Drop existing foreign keys if they exist (without CASCADE)
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_room_id_fkey;
ALTER TABLE public.game_state DROP CONSTRAINT IF EXISTS game_state_room_id_fkey;
ALTER TABLE public.player_hands DROP CONSTRAINT IF EXISTS player_hands_room_id_fkey;
ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_room_id_fkey;

-- Add foreign key constraints with ON DELETE CASCADE
ALTER TABLE public.players
ADD CONSTRAINT players_room_id_fkey 
FOREIGN KEY (room_id) 
REFERENCES public.rooms(id) 
ON DELETE CASCADE;

ALTER TABLE public.game_state
ADD CONSTRAINT game_state_room_id_fkey 
FOREIGN KEY (room_id) 
REFERENCES public.rooms(id) 
ON DELETE CASCADE;

ALTER TABLE public.player_hands
ADD CONSTRAINT player_hands_room_id_fkey 
FOREIGN KEY (room_id) 
REFERENCES public.rooms(id) 
ON DELETE CASCADE;

ALTER TABLE public.submissions
ADD CONSTRAINT submissions_room_id_fkey 
FOREIGN KEY (room_id) 
REFERENCES public.rooms(id) 
ON DELETE CASCADE;