-- Optimization 2: Add hand array column to players (replaces player_hands table)
ALTER TABLE players ADD COLUMN IF NOT EXISTS hand uuid[] DEFAULT '{}';

-- Optimization 3: Server-side card dealing functions

-- Deal 6 initial cards to all non-judge players in a room (used at game start)
CREATE OR REPLACE FUNCTION deal_initial_cards(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  avail uuid[];
BEGIN
  SELECT ARRAY(
    SELECT id FROM cards WHERE type = 'reply' ORDER BY random()
  ) INTO avail;

  FOR rec IN
    SELECT id FROM players
    WHERE room_id = p_room_id AND is_judge = false AND in_game = true
    ORDER BY joined_at
  LOOP
    IF cardinality(avail) >= 6 THEN
      UPDATE players SET hand = avail[1:6] WHERE id = rec.id;
      avail := avail[7:];
    END IF;
  END LOOP;
END;
$$;

-- Optimization 1 + 3: Deal exactly 1 new card to each non-judge player (draw-1 rule between rounds)
CREATE OR REPLACE FUNCTION deal_one_card(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  held_cards uuid[];
  new_card uuid;
BEGIN
  FOR rec IN
    SELECT id FROM players
    WHERE room_id = p_room_id AND is_judge = false AND in_game = true
    ORDER BY joined_at
  LOOP
    -- Re-read all held cards each iteration so we never double-assign
    SELECT ARRAY(
      SELECT UNNEST(COALESCE(hand, '{}'))
      FROM players
      WHERE room_id = p_room_id
    ) INTO held_cards;

    SELECT id INTO new_card
    FROM cards
    WHERE type = 'reply'
    AND NOT (id = ANY(held_cards))
    ORDER BY random()
    LIMIT 1;

    IF new_card IS NOT NULL THEN
      UPDATE players
      SET hand = array_append(COALESCE(hand, '{}'), new_card)
      WHERE id = rec.id;
    END IF;
  END LOOP;
END;
$$;

-- Remove a single card from a player's hand when they submit it
CREATE OR REPLACE FUNCTION remove_card_from_hand(p_player_id uuid, p_card_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE players SET hand = array_remove(hand, p_card_id) WHERE id = p_player_id;
$$;

-- Clear all hands in a room (used at game end or return to lobby)
CREATE OR REPLACE FUNCTION clear_room_hands(p_room_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE players SET hand = '{}' WHERE room_id = p_room_id;
$$;
