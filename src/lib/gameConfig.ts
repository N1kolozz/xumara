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

// Round-timer durations (ms). Expired phases are resolved server-side by the
// pg_cron watchdog (resolve_expired_phases in the server_phase_watchdog
// migration); clients render the countdown from phase_deadline and fire a
// best-effort fallback RPC shortly after it passes. These durations are
// mirrored in that migration's SQL — keep them in sync.
export const SUBMIT_MS = 60_000;
export const JUDGE_MS = 40_000;
// Reveal pacing: cards flip one-by-one, then the judge can pick.
export const REVEAL_BASE_MS = 700;
export const REVEAL_PER_CARD_MS = 850;

export const revealDurationMs = (cardCount: number) =>
  REVEAL_BASE_MS + Math.max(0, cardCount) * REVEAL_PER_CARD_MS;

// Ephemeral reactions broadcast during reveal/judging (no DB storage).
export const REACTION_EMOJIS = ["😂", "🔥", "💀", "👏", "❤️"] as const;
