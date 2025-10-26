-- Enable full replica identity for players table to ensure all column updates are captured in realtime
ALTER TABLE public.players REPLICA IDENTITY FULL;