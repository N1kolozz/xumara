// Shared game configuration: packs, timers, the blank-card sentinel and reactions.
// Kept in one place so the lobby, action hooks and the board stay in sync.

// The blank "write-your-own" template card. Seeded with this exact id in
// supabase/migrations/20260602120000_loop_features.sql so the client can append
// it to every hand without a DB round-trip.
export const BLANK_CARD_ID = "00000000-0000-0000-0000-000000000b1a";
export const BLANK_CARD_TEXT = "✍️ შენი პასუხი";

// Number of real (non-blank) reply cards each hand holds. The UI adds the blank
// as a permanent 6th slot. Must match deal_initial_cards in the migration.
export const HAND_SIZE = 5;

// Per-card flip stagger (ms) for the reveal choreography. This is purely a
// client-side animation value — it drives the one-by-one card flip and the
// matching haptic tick in GameBoard.
//
// The authoritative round-timer durations (submit 60s, judge 60s, reveal
// pacing) live in the SQL: see resolve_room_phase / submit_card in the
// server_phase_watchdog and extend_judge_timer migrations. Clients never set a
// deadline themselves — they render the countdown from game_state.phase_deadline
// — so those durations deliberately do NOT live here.
export const REVEAL_PER_CARD_MS = 850;

// Ephemeral reactions broadcast during reveal/judging (no DB storage).
export const REACTION_EMOJIS = ["😂", "🔥", "💀", "👏", "❤️"] as const;
