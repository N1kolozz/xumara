-- Add unique constraint to rooms.pin to prevent duplicate PINs
ALTER TABLE rooms ADD CONSTRAINT rooms_pin_unique UNIQUE (pin);