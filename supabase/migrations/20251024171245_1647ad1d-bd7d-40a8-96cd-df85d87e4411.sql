-- Create rooms table
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin TEXT NOT NULL UNIQUE,
  host_id UUID,
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'finished')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create players table
CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  is_judge BOOLEAN NOT NULL DEFAULT false,
  is_host BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create cards table
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('inbox', 'reply')),
  text_ge TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create game_state table
CREATE TABLE public.game_state (
  room_id UUID PRIMARY KEY REFERENCES public.rooms(id) ON DELETE CASCADE,
  current_judge_id UUID REFERENCES public.players(id),
  current_inbox_card_id UUID REFERENCES public.cards(id),
  round_number INTEGER NOT NULL DEFAULT 1,
  phase TEXT NOT NULL DEFAULT 'waiting' CHECK (phase IN ('waiting', 'submitting', 'judging', 'revealing')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create submissions table
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id),
  round_number INTEGER NOT NULL,
  is_winner BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create player_hands table to track which cards each player has
CREATE TABLE public.player_hands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  UNIQUE(player_id, card_id)
);

-- Enable Row Level Security
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_hands ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rooms (public read for joining)
CREATE POLICY "Anyone can view rooms" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can create rooms" ON public.rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Host can update room" ON public.rooms FOR UPDATE USING (true);

-- RLS Policies for players
CREATE POLICY "Anyone can view players" ON public.players FOR SELECT USING (true);
CREATE POLICY "Anyone can join as player" ON public.players FOR INSERT WITH CHECK (true);
CREATE POLICY "Players can update themselves" ON public.players FOR UPDATE USING (true);

-- RLS Policies for cards (public read)
CREATE POLICY "Anyone can view cards" ON public.cards FOR SELECT USING (true);
CREATE POLICY "Anyone can create cards" ON public.cards FOR INSERT WITH CHECK (true);

-- RLS Policies for game_state
CREATE POLICY "Anyone can view game state" ON public.game_state FOR SELECT USING (true);
CREATE POLICY "Anyone can update game state" ON public.game_state FOR UPDATE USING (true);
CREATE POLICY "Anyone can create game state" ON public.game_state FOR INSERT WITH CHECK (true);

-- RLS Policies for submissions
CREATE POLICY "Anyone can view submissions" ON public.submissions FOR SELECT USING (true);
CREATE POLICY "Anyone can create submissions" ON public.submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update submissions" ON public.submissions FOR UPDATE USING (true);

-- RLS Policies for player_hands
CREATE POLICY "Anyone can view hands" ON public.player_hands FOR SELECT USING (true);
CREATE POLICY "Anyone can manage hands" ON public.player_hands FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete from hands" ON public.player_hands FOR DELETE USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_hands;

-- Insert sample Georgian cards
INSERT INTO public.cards (type, text_ge) VALUES
-- Inbox cards (questions)
('inbox', 'რა არის ყველაზე უცნაური რამ რაც შენ გიკეთებია?'),
('inbox', 'რას იტყოდი თუ შენი ყველაზე დიდი საიდუმლო გახდებოდა ცნობილი?'),
('inbox', 'რა არის ყველაზე სასაცილო ბავშვობის ისტორია რომელიც გახსოვს?'),
('inbox', 'რომელი სუპერძალა გინდოდა ყველაზე მეტად?'),
('inbox', 'რა იქნებოდა შენი პირველი ნაბიჯი თუ ლატარეა მოგიგდა?'),
('inbox', 'რა არის შენი საიდუმლო ნიჭი?'),
('inbox', 'რომელი ცნობილი ადამიანი იქნებოდა შენი იდეალური მეგობარი?'),
('inbox', 'რას აკეთებდი თუ ერთი დღით უხილავი შეიძლებოდი?'),

-- Reply cards (answers)
('reply', '🤣 ვცდილობ არ გავიცინო და ვერ ვიღებ თავს'),
('reply', '😅 რა თქმა უნდა, მაგრამ არავის ვეტყვი'),
('reply', '🙈 ეს არის ჩემი ყველაზე დიდი საიდუმლო'),
('reply', '😎 ამაზე არაფერი უკეთესი არ არსებობს'),
('reply', '🤔 ალბათ ვცდებით, მაგრამ მაინც კარგია'),
('reply', '😂 აბსოლუტურად ყველაფერი რაც არ უნდა გაკეთდეს'),
('reply', '🎉 როცა არავინ მიყურებს'),
('reply', '💪 ყოველდღე, დილის 5 საათზე'),
('reply', '🤷 ვიცი რომ ცუდია, მაგრამ მაინც ვაგრძელებ'),
('reply', '😱 მხოლოდ შაბათ-კვირას'),
('reply', '🎭 როცა მშობლები სახლში არ არიან'),
('reply', '🔥 ეს არის ჩემი სუპერძალა'),
('reply', '💰 მხოლოდ ფულის გამო'),
('reply', '🎮 ვთამაშობ ვიდეო თამაშებს'),
('reply', '🍕 პიცას ვჭამ'),
('reply', '😴 მძინავს'),
('reply', '📱 ინსტაგრამს ვათვალიერებ'),
('reply', '🎵 მუსიკას ვუსმენ'),
('reply', '🏃 ვგაქცევი'),
('reply', '😈 არავისთვის მეტყვის'),
('reply', '🤫 ეს დარჩეს ჩვენს შორის'),
('reply', '🎪 ამას ყოველდღე ვაკეთებ'),
('reply', '⚡ როცა მე ვარ მხიარული'),
('reply', '🌟 ეს ჩემი ახალი ჰობია');
