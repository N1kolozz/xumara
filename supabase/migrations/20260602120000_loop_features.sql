-- Loop features: packs (one category per game), blank cards, reveal timer.
-- Adds category/blank support to cards, pack + phase_deadline to game_state,
-- custom_text to submissions, seeds categorized starter packs, and rewrites the
-- card-dealing RPCs to filter by the game's chosen pack and reserve a blank slot.

-- ── Schema additions ────────────────────────────────────────────────────────
ALTER TABLE public.cards        ADD COLUMN IF NOT EXISTS category   TEXT;
ALTER TABLE public.cards        ADD COLUMN IF NOT EXISTS is_blank    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.game_state   ADD COLUMN IF NOT EXISTS pack            TEXT;
ALTER TABLE public.game_state   ADD COLUMN IF NOT EXISTS phase_deadline  TIMESTAMPTZ;
ALTER TABLE public.submissions  ADD COLUMN IF NOT EXISTS custom_text TEXT;

-- ── Blank template card (fixed id so the client can reference it) ────────────
INSERT INTO public.cards (id, type, text_ge, category, is_blank)
VALUES ('00000000-0000-0000-0000-000000000b1a', 'reply', '✍️ შენი პასუხი', NULL, true)
ON CONFLICT (id) DO NOTHING;

-- ── Pack: verb (ზმნები) — "რას აკეთებ...?" questions, 1st-person verb answers ─
INSERT INTO public.cards (type, text_ge, category) VALUES
('inbox', 'რას აკეთებ, როცა მარტო ხარ სახლში?', 'verb'),
('inbox', 'რას აკეთებ პარასკევს ღამით?', 'verb'),
('inbox', 'რას აკეთებ, როცა ვერავინ გხედავს?', 'verb'),
('inbox', 'რას აკეთებ მოსაწყენ შეხვედრაზე?', 'verb'),
('inbox', 'რას აკეთებ ფულის მოგების შემთხვევაში?', 'verb'),
('reply', 'ვცეკვავ სარკის წინ', 'verb'),
('reply', 'მთელი დღე ვიძინებ', 'verb'),
('reply', 'მაცივარს ვცლი შუა ღამეს', 'verb'),
('reply', 'ვმღერი დუშის ქვეშ', 'verb'),
('reply', 'სერიალს ვუყურებ და ვტირი', 'verb'),
('reply', 'კატას ველაპარაკები', 'verb'),
('reply', 'ინსტაგრამს ვასქროლავ უაზროდ', 'verb'),
('reply', 'პიცას ვუკვეთავ და ვმალავ', 'verb'),
('reply', 'სელფებს ვიღებ ას-ჯერ', 'verb'),
('reply', 'მეზობელს ვუსმენ კედელთან', 'verb'),
('reply', 'ვვარჯიშობ ერთ წუთს და ვნებდები', 'verb'),
('reply', 'ფეხსაცმელებს ვყიდულობ ონლაინ', 'verb'),
('reply', 'საქმეს ვადებ ხვალამდე', 'verb'),
('reply', 'ვჭამ და ვამბობ რომ დიეტაზე ვარ', 'verb'),
('reply', 'გუგლში ჩემს სახელს ვწერ', 'verb'),
('reply', 'ვწერ შეტყობინებას და ვშლი', 'verb'),
('reply', 'ვმალავ შოკოლადს ბავშვებისგან', 'verb'),
('reply', 'ვლაპარაკობ ჩემს თავთან ხმამაღლა', 'verb'),
('reply', 'ვტირი მუსიკალურ კლიპებზე', 'verb'),
('reply', 'ვათვალიერებ მაცივარს ყოველ ხუთ წუთში', 'verb');

-- ── Pack: character (ხასიათი) — "როგორი ხარ...?" questions, adjective answers ─
INSERT INTO public.cards (type, text_ge, category) VALUES
('inbox', 'როგორი ხარ დილით გაღვიძების შემდეგ?', 'character'),
('inbox', 'რა ტიპის მეგობარი ხარ?', 'character'),
('inbox', 'როგორი ხარ, როცა მშია?', 'character'),
('inbox', 'როგორ გხედავენ სხვები შენ?', 'character'),
('inbox', 'როგორი ხარ მარცხის დროს?', 'character'),
('reply', 'ზარმაცი მაგრამ ნიჭიერი', 'character'),
('reply', 'სასტიკად პირდაპირი', 'character'),
('reply', 'გარეგნულად მშვიდი, შიგნით ქაოსი', 'character'),
('reply', 'დრამის სამეფო დედოფალი', 'character'),
('reply', 'მუდამ დაგვიანებული', 'character'),
('reply', 'საშინლად ჯიუტი', 'character'),
('reply', 'ზედმეტად ემოციური', 'character'),
('reply', 'გენიალურად უაზრო', 'character'),
('reply', 'სიმპათიური მაგრამ საშიში', 'character'),
('reply', 'მშიერი და ბრაზიანი', 'character'),
('reply', 'უსაზღვროდ ოპტიმისტი', 'character'),
('reply', 'დაუძლეველად ცნობისმოყვარე', 'character'),
('reply', 'ცოტა ხმაურიანი, ცოტა ცქვიტი', 'character'),
('reply', 'მომხიბვლელად მოუხერხებელი', 'character'),
('reply', 'იდუმალი და გაუგებარი', 'character'),
('reply', 'ზედმეტად თავდაჯერებული', 'character'),
('reply', 'გულუბრყვილო და თბილი', 'character'),
('reply', 'ნელი მაგრამ საიმედო', 'character'),
('reply', 'ენერგიული გიჟივით', 'character'),
('reply', 'სევდიანი მაგრამ მხიარული', 'character');

-- ── Pack: logic (ლოგიკა) — "რატომ...?" questions, "იმიტომ რომ..." answers ─────
INSERT INTO public.cards (type, text_ge, category) VALUES
('inbox', 'რატომ აგვიანებ ყოველთვის?', 'logic'),
('inbox', 'რა მოხდება, თუ ხვალ სამყარო დასრულდება?', 'logic'),
('inbox', 'რატომ არ მიპასუხე შეტყობინებაზე?', 'logic'),
('inbox', 'რატომ ხარ ასე დაღლილი?', 'logic'),
('inbox', 'რატომ ვერ დაიჭირე თავი?', 'logic'),
('reply', 'იმიტომ რომ დივანი ძალიან კომფორტული იყო', 'logic'),
('reply', 'იმიტომ რომ ვერ ვიპოვე მოტივაცია', 'logic'),
('reply', 'იმიტომ რომ კატა ჩემს მუხლზე იჯდა', 'logic'),
('reply', 'იმიტომ რომ ღამე სამამდე სერიალს ვუყურებდი', 'logic'),
('reply', 'იმიტომ რომ მავიწყდება ყველაფერი', 'logic'),
('reply', 'იმიტომ რომ ასე უფრო საინტერესოა', 'logic'),
('reply', 'იმიტომ რომ ინტერნეტი გაითიშა', 'logic'),
('reply', 'იმიტომ რომ მე ასე გადავწყვიტე', 'logic'),
('reply', 'იმიტომ რომ მძინავდა ღია თვალებით', 'logic'),
('reply', 'იმიტომ რომ ვმალავდი სიმართლეს', 'logic'),
('reply', 'იმიტომ რომ შენ არ მკითხე', 'logic'),
('reply', 'იმიტომ რომ ფული უკვე გავხარჯე', 'logic'),
('reply', 'იმიტომ რომ მთვარე სავსე იყო', 'logic'),
('reply', 'იმიტომ რომ ნამცხვარზე უარს ვერ ვამბობ', 'logic'),
('reply', 'იმიტომ რომ პრინციპი მაქვს', 'logic'),
('reply', 'იმიტომ რომ მაინც მე ვიყავი მართალი', 'logic'),
('reply', 'იმიტომ რომ დრო შედარებითია', 'logic'),
('reply', 'იმიტომ რომ ასე ბედნიერი ვარ', 'logic'),
('reply', 'იმიტომ რომ შთაბეჭდილების მოხდენას ვცდილობდი', 'logic'),
('reply', 'იმიტომ რომ უბრალოდ შემეძლო', 'logic');

-- ── Rewrite deal RPCs: pack-aware, blank-excluded, 5 real cards per hand ─────
-- Deal 5 initial reply cards to each non-judge player, filtered by the room's pack.
CREATE OR REPLACE FUNCTION deal_initial_cards(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  avail uuid[];
  v_pack TEXT;
BEGIN
  SELECT pack INTO v_pack FROM game_state WHERE room_id = p_room_id;

  SELECT ARRAY(
    SELECT id FROM cards
    WHERE type = 'reply'
      AND is_blank = false
      AND (v_pack IS NULL OR category = v_pack)
    ORDER BY random()
  ) INTO avail;

  FOR rec IN
    SELECT id FROM players
    WHERE room_id = p_room_id AND is_judge = false AND in_game = true
    ORDER BY joined_at
  LOOP
    IF cardinality(avail) >= 5 THEN
      UPDATE players SET hand = avail[1:5] WHERE id = rec.id;
      avail := avail[6:];
    END IF;
  END LOOP;
END;
$$;

-- Deal exactly 1 new reply card to each non-judge player, filtered by pack.
CREATE OR REPLACE FUNCTION deal_one_card(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  held_cards uuid[];
  new_card uuid;
  v_pack TEXT;
BEGIN
  SELECT pack INTO v_pack FROM game_state WHERE room_id = p_room_id;

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
      AND is_blank = false
      AND (v_pack IS NULL OR category = v_pack)
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
