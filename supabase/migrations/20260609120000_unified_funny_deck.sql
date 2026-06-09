-- Drop the category packs in favour of one unified deck.
-- Every question is a "რას აკეთებ...?" (what do you do when…?) situation and
-- every answer is a first-person action, so ANY answer fits ANY question both
-- grammatically and logically — the comedy comes from the weird combinations.
-- The category column stays on the table (harmless) but all cards are NULL now,
-- so the pack-aware deal RPCs simply use the whole deck.

-- ── Clear old cards + the references that would block the delete ──────────────
UPDATE public.game_state  SET current_inbox_card_id = NULL;
DELETE FROM public.submissions;
DELETE FROM public.cards WHERE is_blank = false;

-- ── Questions (inbox) — all take a first-person action answer ─────────────────
INSERT INTO public.cards (type, text_ge, category) VALUES
('inbox', 'რას აკეთებ, როცა მარტო ხარ სახლში?', NULL),
('inbox', 'რას აკეთებ პარასკევს ღამით?', NULL),
('inbox', 'რას აკეთებ, როცა ვერავინ გხედავს?', NULL),
('inbox', 'რას აკეთებ მოსაწყენ შეხვედრაზე?', NULL),
('inbox', 'რას აკეთებ, როცა ფულს მოიგებ?', NULL),
('inbox', 'რას აკეთებ პირველ პაემანზე?', NULL),
('inbox', 'რას აკეთებ, როცა ინტერნეტი გაითიშება?', NULL),
('inbox', 'რას აკეთებ, როცა მთელი მსოფლიო გიყურებს?', NULL),
('inbox', 'რას აკეთებ, როცა ბოსი ზურგს გაქცევს?', NULL),
('inbox', 'რას აკეთებ, როცა ექსი მოგწერს შუა ღამეს?', NULL),
('inbox', 'რას აკეთებ, როცა დილის 3 საათია და ვერ იძინებ?', NULL),
('inbox', 'რას აკეთებ, როცა მაცივარი ცარიელია?', NULL),
('inbox', 'რას აკეთებ, როცა სტუმრები მოულოდნელად მოვიდნენ?', NULL),
('inbox', 'რას აკეთებ, როცა ლიფტში ჩაიკეტები?', NULL),
('inbox', 'რას აკეთებ, როცა ყველა გაიგებს შენს საიდუმლოს?', NULL),
('inbox', 'რას აკეთებ, როცა ორშაბათი დგება?', NULL),
('inbox', 'რას აკეთებ, როცა საქმე ბევრია და დრო ცოტა?', NULL),
('inbox', 'რას აკეთებ, როცა ვინმე მოგწონს?', NULL),
('inbox', 'რას აკეთებ, როცა გრძნობ რომ გენიოსი ხარ?', NULL),
('inbox', 'რას აკეთებ, როცა ცხოვრება გეუბნება „არა"?', NULL),
('inbox', 'რას აკეთებ, როცა ვერ იხსენებ პაროლს?', NULL),
('inbox', 'რას აკეთებ, როცა დღესასწაულია?', NULL);

-- ── Answers (reply) — first-person actions, funny & weird ────────────────────
INSERT INTO public.cards (type, text_ge, category) VALUES
('reply', 'ვცეკვავ სარკის წინ', NULL),
('reply', 'მთელი დღე ვიძინებ', NULL),
('reply', 'მაცივარს ვცლი შუა ღამეს', NULL),
('reply', 'ვმღერი დუშის ქვეშ', NULL),
('reply', 'სერიალს ვუყურებ და ვტირი', NULL),
('reply', 'კატას ველაპარაკები', NULL),
('reply', 'ინსტაგრამს ვასქროლავ უაზროდ', NULL),
('reply', 'პიცას ვუკვეთავ და ვმალავ', NULL),
('reply', 'სელფებს ვიღებ ას-ჯერ', NULL),
('reply', 'მეზობელს ვუსმენ კედელთან', NULL),
('reply', 'ვვარჯიშობ ერთ წუთს და ვნებდები', NULL),
('reply', 'საქმეს ვადებ ხვალამდე', NULL),
('reply', 'ვჭამ და ვამბობ რომ დიეტაზე ვარ', NULL),
('reply', 'გუგლში ჩემს სახელს ვწერ', NULL),
('reply', 'ვწერ შეტყობინებას და ვშლი', NULL),
('reply', 'ვმალავ შოკოლადს ბავშვებისგან', NULL),
('reply', 'ჩემს თავს ხმამაღლა ველაპარაკები', NULL),
('reply', 'ვტირი მუსიკალურ კლიპებზე', NULL),
('reply', 'მაცივარს ვათვალიერებ ყოველ ხუთ წუთში', NULL),
('reply', 'ეროვნულ ჰიმნს ვმღერი მთელ ხმაზე', NULL),
('reply', 'ვადგები და ისევ ვწვები', NULL),
('reply', 'ნამცხვარს ვჭამ და ვტირი ბედნიერებისგან', NULL),
('reply', 'ვცეკვავ ვითომ არავინ მიყურებს', NULL),
('reply', 'მემებს ვაგროვებ და არავის ვუგზავნი', NULL),
('reply', 'მცენარეებს ველაპარაკები', NULL),
('reply', 'ჭერს ვუყურებ და ვფიქრობ ცხოვრებაზე', NULL),
('reply', 'საბნის ქვეშ ვიმალები', NULL),
('reply', 'ექსს ვუგზავნი შეტყობინებას და ვინანებ', NULL),
('reply', 'მაცივართან ვცეკვავ', NULL),
('reply', 'ვჭამ ღამით და ვამბობ რომ ხვალ დავიწყებ', NULL),
('reply', 'მანქანაში ვმღერი წითელ შუქზე', NULL),
('reply', 'ახალ ენას ვსწავლობ ერთი დღე და ვნებდები', NULL),
('reply', 'ვთამაშობ თამაშებს და ვყვირი', NULL),
('reply', 'ჭიქებს ვაგროვებ ნიჟარაში', NULL),
('reply', 'კულინარიულ შოუებს ვუყურებ მშიერი', NULL),
('reply', 'კლავიატურაზე ვაკაკუნებ ვითომ ვმუშაობ', NULL),
('reply', 'წინდებით ვცეკვავ ხალიჩაზე', NULL),
('reply', 'ჩამონათვალს ვწერ და ვკარგავ', NULL),
('reply', 'ძველ ფოტოებს ვუყურებ და ვცინი', NULL),
('reply', 'პრობლემებს იუმორის უკან ვმალავ', NULL),
('reply', 'ერთ სიმღერას ვუსმენ ას-ჯერ', NULL),
('reply', 'ვცდილობ მშვიდად გამოვიყურებოდე', NULL),
('reply', 'ცივ ყავას ვათბობ მესამედ', NULL),
('reply', 'გეგმებს ვაგროვებ და არცერთს ვასრულებ', NULL),
('reply', 'ვცეკვავ სიხარულით უმიზეზოდ', NULL),
('reply', 'ფანჯარაში ვიყურები დრამატულად', NULL),
('reply', 'ვცდილობ დავიჭირო თავი და ვმარცხდები', NULL),
('reply', 'ვიცინი ხმამაღლა ჩემს ხუმრობებზე', NULL);
