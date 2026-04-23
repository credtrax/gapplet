# Roadmap

The authoritative priority list lives in Claude Code's task tracker for
this project. This document captures the high-level phases so a human
opening the repo has a sense of where things stand without reading the
whole task log.

## Where we are (as of 2026-04-22)

The backend-track foundation is complete. The game is end-to-end
functional on `localhost:5174`:

- ✅ Isomorphic shared-code refactor (client + Edge Function import the
  same `src/lib/*` modules)
- ✅ ENABLE dictionary (1–5 letter words, ~13,600 entries)
- ✅ Daily shared puzzle (FNV-1a hash of UTC date → seed from a baked
  ~1,250-entry pool)
- ✅ Supabase schema (profiles + games + leaderboard views, RLS
  insert-locked to service_role)
- ✅ Supabase Auth wired (Google verified end-to-end; GitHub + email
  magic link code-ready)
- ✅ `validate-score` Edge Function (server-side move replay, the
  anti-cheat keystone)
- ✅ Client submits move history on game-end
- ✅ Daily leaderboard UI (top 20 + overflow-rank row)
- ✅ Share button with spoiler-free emoji timeline
- ✅ On-screen keyboard (Wordle-style layout, mobile-first)
- ✅ Star-move mechanic (interior space doubles chain, no cap)
- ✅ 6-slide how-to-play tutorial (auto-opens on first visit)

## Pre-launch remaining

Before the game can go public at `gapplet.joecorn.com`:

- **Deploy** — Vercel for the frontend, DNS at Hostinger (task #11)
- **Tile visual refresh** — Scrabble-inspired but distinct, with a
  star-move animation (task #19)
- **Content blocklist** — ENABLE is public-domain and predates the TWL06
  cleanup; a slur filter before shipping is a brand-safety requirement
  (task #21)

## Near-term UX polish

Queued after launch blockers but before the feature-expansion round:

- Dark mode via `prefers-color-scheme` (task #16)
- Two-line status area with scrolling chain + chain-break explanations
  (task #20)
- Hamburger menu that hosts Account / Score History / How-to-Play /
  Settings (task #17)
- Letter-values reference chart (task #26)
- Buy Guess auto-commit (task #25, always-on UX simplification)
- Auto-commit mode toggle (task #24, opt-in speedrunner setting)

## Feature expansion (post-launch)

- Hard mode — disables escape hatches, separate leaderboard tier
  (task #22)
- User-created groups with private leaderboards (task #23)
- Apple Sign-In — waiting on Joe's Apple Developer org-tier DUNS
  verification (task #13)

## Hygiene + infra

- Keep `CLAUDE.md` and these docs in sync with architectural changes
  (task #12 — this is the task that wrote this version of the doc).
- Tests: still zero. Vitest is in `devDependencies` but no suite exists
  yet. Lowest-priority gap while the surface area is still shifting
  daily. Worth revisiting once the game feels stable.

## Out of scope

- Accounts with passwords (we use OAuth + email magic link only)
- Microtransactions, ads, telemetry beyond what Supabase logs by default
- Native mobile apps (mobile web first)
- Integration with Anthropic products or with CredentialTrax

For anything else, check the live task list via Claude Code's task tools
in-session, or just ask Joe.
