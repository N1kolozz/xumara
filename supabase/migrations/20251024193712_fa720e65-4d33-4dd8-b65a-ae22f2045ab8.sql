-- Add max_rounds column to game_state table
ALTER TABLE game_state ADD COLUMN max_rounds integer NOT NULL DEFAULT 5;