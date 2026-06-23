# ხუმარა (Xumara)

A mobile-first, real-time **party card game** in Georgian — a "funniest answer wins" game in the
*Cards Against Humanity* mould. One player is the **judge** (მსაჯული) each round and reads a prompt
card; everyone else (the **comedians**, ხუმარა) plays the funniest answer from their hand. The judge
picks a winner, scores tick up, and the next round begins. Players join a room by **PIN** or by
scanning a **QR code** — no accounts, no installs (though it's an installable PWA).

> **Stack:** React 18 + Vite + TypeScript · Tailwind CSS · Supabase (Postgres, Realtime, anonymous
> auth) · deployed as a static PWA on Cloudflare Pages.

---

## Table of contents

- [How the game works](#how-the-game-works)
- [Architecture at a glance](#architecture-at-a-glance)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Database & migrations](#database--migrations)
- [Deployment](#deployment)
- [Keeping Supabase awake](#keeping-supabase-awake)
- [Project structure](#project-structure)
- [Conventions & gotchas](#conventions--gotchas)

---

## How the game works

1. A host **creates a room** and picks a role (judge or comedian). A 6-character PIN is generated.
2. Others **join** with the PIN (or QR deep-link `/?pin=XXXX`) and pick a role. Max 8 players, exactly
   one judge.
3. The host starts the game (minimum 3 players, one of whom is the judge). Each comedian is dealt a
   hand of 5 cards plus a permanent **blank "write-your-own"** card.
4. Each round moves through three phases, all driven by a shared server clock
   (`game_state.phase_deadline`):
   - **submitting** — comedians play one card (or write a custom answer). Advances early once everyone
     has submitted.
   - **revealing** — submitted cards flip face-up one by one.
   - **judging** — the judge taps the funniest; that player scores a point.
5. After `max_rounds`, the highest score wins. The host can **rematch** (same room) or send everyone
   **back to the lobby**.

If a phase's deadline passes (e.g. a player locks their phone), the game advances on its own — see
[Architecture](#architecture-at-a-glance).

---

## Architecture at a glance

The defining design decision: **the client is not trusted.** All four game tables (`rooms`,
`players`, `game_state`, `submissions`) are **read-only** to clients via RLS. Every write goes through
a `SECURITY DEFINER` Postgres RPC that validates the caller and enforces the rules server-side. A
player with devtools can't forge a submission, set their own score, skip a phase, or wipe another
room.

```
┌────────────┐   read-only SELECT + Realtime stream    ┌──────────────────────────┐
│  Browser   │ ◀────────────────────────────────────── │  Supabase Postgres       │
│  (React)   │                                          │                          │
│            │   writes ONLY via RPC (validated)        │  Tables (RLS read-only): │
│  hooks ────┼────────────────────────────────────────▶│   rooms, players,        │
│            │   create_room / join_room / leave_room   │   game_state, submissions│
│            │   start_game_state / submit_card /       │                          │
│            │   resolve_round / rematch_game / ...      │  SECURITY DEFINER RPCs   │
└─────┬──────┘                                          │  enforce all the rules   │
      │  Realtime channels (postgres_changes +          │                          │
      │  broadcast + presence)                          │  pg_cron watchdog every  │
      │                                                  │  5s: advances expired    │
      ▼                                                  │  phases; every 60s:      │
   live UI updates                                       │  sweeps abandoned rooms  │
                                                         └──────────────────────────┘
```

**Phase advancement is server-authoritative.** Mobile browsers suspend timers in backgrounded tabs,
so the game never relies on a client to advance it. A `pg_cron` watchdog (`resolve_expired_phases`,
every 5s) resolves any expired phase. Clients also fire a best-effort fallback RPC just after a
deadline so it *feels* instant — `resolve_round` / `resolve_room_phase` take a row lock and no-op if
the phase already moved, so the watchdog, the fallback, and the judge's tap can never double-resolve.

**Room lifecycle / ghost-room cleanup** uses three layers so abandoned rooms always disappear:

| Mechanism | Covers | Where |
|---|---|---|
| **Realtime Presence** — remaining clients elect one "janitor" to prune a member who dropped off the channel after a grace period | tab close / disconnect while others remain | `useGameSession.ts`, `prune_absent_player` RPC |
| **`pagehide` self-removal** (only when alone) | the *last* person closing the tab cleanly | `useGameSession.ts`, `leave_room` RPC |
| **Heartbeat + `pg_cron` sweep** — clients stamp `players.last_seen`; a sweep reaps players stale for 5 min | the last player hard-crashing (no client left to clean up) | `heartbeat` / `sweep_stale_players` RPCs |

Removing the last player deletes the room (cascading away its game state).

---

## Local development

**Prerequisites:** Node 18+ and npm. (A Supabase project is needed for anything beyond a static UI
render — see below.)

```bash
npm install
cp .env.example .env      # then fill in your Supabase values (see next section)
npm run dev               # Vite dev server on http://localhost:3000
```

Scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server (port 3000). |
| `npm run build` | Production build to `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run lint` | ESLint over the whole project. |
| `npm run migrate` | Push Supabase migrations (`npx supabase db push`). |

---

## Environment variables

Copy `.env.example` to `.env` and set:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-jwt-key
```

> ⚠️ **Use the *legacy* anon JWT key** (the long `eyJ…` token from your Supabase project's API
> settings), **not** the newer `sb_publishable_…` key. The Realtime WebSocket only accepts the JWT
> key — with the publishable key the UI loads but live updates silently never arrive.

These are build-time public values (safe to ship to the browser); security is enforced by RLS + the
RPCs, not by hiding the anon key.

---

## Database & migrations

The schema and all server logic live in [`supabase/migrations/`](supabase/migrations/) as timestamped
SQL files (tables, RLS policies, RPCs, triggers, and `pg_cron` jobs). Apply them with:

```bash
npm run migrate        # = npx supabase db push
```

**Manual step — `pg_cron`:** the watchdog and the stale-room sweep are scheduled with `pg_cron`. The
migrations try `CREATE EXTENSION IF NOT EXISTS pg_cron`, but on some plans that fails during
`db push`. If so, enable it once in the dashboard (**Database → Extensions → pg_cron**) and re-run the
migration. Without `pg_cron` the game still works — the client-side fallback timers advance phases —
but abandoned rooms won't be swept and a fully backgrounded room won't auto-advance.

**Card content** (the prompt/answer decks) is seeded by the `*_loop_features` and
`*_unified_funny_deck` migrations into the `cards` table.

---

## Deployment

The app is a static SPA + service worker deployed to **Cloudflare Pages** via
[`wrangler.jsonc`](wrangler.jsonc), which serves `./dist` with single-page-application fallback.

```bash
npm run build
npx wrangler deploy      # or connect the repo to Cloudflare Pages for auto-deploys
```

The PWA is configured for `autoUpdate` with `skipWaiting` + `clientsClaim` (see
[`vite.config.ts`](vite.config.ts)), so a fresh build reaches users on their next load without a
manual cache clear.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint, type-check, and build on every
push and PR.

---

## Keeping Supabase awake

Free-tier Supabase projects pause after ~7 days of inactivity. The
[`keep-supabase-awake`](.github/workflows/keep-supabase-awake.yml) GitHub Action pings the REST API
daily to keep the project active. It needs two repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

(Set them under **Settings → Secrets and variables → Actions**.)

---

## Project structure

```
src/
  pages/                 Route entry points (Index = home, Game, NotFound)
  components/
    home/                Landing screen: hero, create/join modals, role + info
    game/                GameLobby + GameBoard (the in-game UI)
    ui/                  Small shadcn-style primitives (button, badge, toast, …)
  hooks/
    useRoomSetup         Create/join a room (anonymous auth + RPC)
    useGameSession       Room + player + presence state, realtime subscriptions
    useGameActions       Start / leave / rematch / return-to-lobby
    useGameBoardData     In-game data (hand, inbox card, submissions, reactions)
    useGameBoardActions  Submit a card, pick a winner, fallback phase resolution
  lib/                   gameConfig, haptics, viewport-zoom-lock, utils
  integrations/supabase/ Typed Supabase client + generated DB types
  types/game.ts          Shared domain types (Room, Player, GameState, …)
supabase/migrations/     Schema, RLS, RPCs, triggers, pg_cron jobs
```

---

## Conventions & gotchas

- **All gameplay writes go through RPCs.** Don't add a client-side `INSERT`/`UPDATE`/`DELETE` against
  `rooms`/`players`/`game_state`/`submissions` — RLS will reject it. Add or extend a `SECURITY
  DEFINER` RPC instead.
- **Timer durations are authoritative in SQL**, not on the client. The client renders the countdown
  from `game_state.phase_deadline`; it never decides phase lengths. Only the reveal-animation stagger
  (`REVEAL_PER_CARD_MS` in `src/lib/gameConfig.ts`) is a client value.
- **The blank card** has a fixed sentinel UUID shared between `src/lib/gameConfig.ts` (`BLANK_CARD_ID`)
  and the seed migration. It's a permanent UI-only hand slot, never dealt or removed.
- **Player identity** is the `player_id` stored in `localStorage`/`sessionStorage` per room; it's the
  capability that gates leave/submit. Anonymous Supabase auth provides the `auth.uid()` that owns the
  player row.
