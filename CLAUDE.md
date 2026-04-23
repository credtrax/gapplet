# CLAUDE.md — Context for Claude Code

This file is read automatically by Claude Code at session start. It's the
architectural and cultural brief — the README is for humans learning the
code; this is for future Claude sessions starting cold.

## Who you're working with

Joe (Joseph Corn). Senior Manager at Sam's Club, COO/CTO of Stone and Spark
Collective LLC, primary technical builder on CredentialTrax (a HIPAA-compliant
SaaS). Gapplet is a personal side project — **not** part of CredentialTrax or
the Stone and Spark business.

Joe's last daily programming was Visual FoxPro 2.6. He's fluent in modern
concepts but explanations help on first exposure: write code readable over
clever, and when you introduce a modern pattern (hooks, TS generics,
async iterators, RLS policies), briefly explain it in a comment the first
time it appears. His memory profile has more detail; check
`memory/user_joe.md` if you want to calibrate further.

## What Gapplet is

A 2-minute word-chain game. Daily shared puzzle (same seed for every player
per UTC date). Start with a 5-letter seed word, change one cell per move,
build the longest chain of valid words you can. Server-verified leaderboard.
Share button emits a spoiler-free emoji timeline.

**Canonical game rules** live in `memory/project_gaplet_rules.md`. Treat that
as the spec. Don't re-derive rules from code comments — the memory file is
explicitly maintained as the source of truth. Visible in-game stats include
Time, Score, Chain, and **Paths** (live count of unused one-swap neighbors
from the last committed board — hidden/muted in hard mode when that ships).

## Architecture at a glance

```
Browser (Vite + React + TS + Tailwind v4)
  │
  │  signed-in players POST move history
  ▼
Supabase Auth (Google / GitHub / email magic link)
  │
  ▼
Supabase Edge Function `validate-score` (Deno)
  │  - imports src/lib/game.ts, seeds.ts, etc. (isomorphic)
  │  - replays moves against the authoritative daily seed
  │  - computes canonical score; rejects tampered submissions
  │
  ▼
Supabase Postgres
  - profiles (auto-created on signup via trigger)
  - games (INSERT-locked to service_role — only the Edge Function writes)
  - daily_leaderboard + all_time_leaderboard views (public-read)
```

Planned frontend host: Vercel. DNS for `gapplet.joecorn.com` at Hostinger
(registrar only — the game isn't hosted there).

## The isomorphic core (load-bearing)

`src/lib/*.ts` is shared between the browser and the Deno Edge Function.
Both runtimes import the same files. This means the server recomputes
scoring using the exact same logic the client used, guaranteeing trust.

Files that must stay platform-neutral (no Vite-specific imports, no DOM,
no Node APIs):

- `src/lib/game.ts` — validateBoard, findNeighbors, scoreMove,
  scoreHintedMove, advanceChain, doubleChain, createdInteriorSplit,
  countDiffs, boardKey, CHAIN_START, CHAIN_STEP
- `src/lib/dictionary.ts` — lazy-init dictionary Set, isWord()
- `src/lib/wordList.ts` — bundled ENABLE 1–5 letter words as `WORDS_TEXT`
  string export (no `?raw` import)
- `src/lib/seeds.ts` — pickSeed (practice/random), pickSeedForDate (daily),
  todaySeed, utcDateString
- `src/lib/eligibleSeeds.ts` — pre-baked array of daily-eligible seeds
- `src/lib/letterValues.ts` — LETTER_VALUES, SPACE, boardPoints

Relative imports in these files use **explicit `.ts` extensions** (e.g.
`./dictionary.ts`). Deno requires it; Vite tolerates it via
`allowImportingTsExtensions: true` in `tsconfig.json`. Don't omit the
extension when adding new imports to this tree.

## Anti-cheat invariant (DO NOT weaken)

There is no RLS policy that grants INSERT / UPDATE / DELETE on
`public.games` to the `anon` or `authenticated` roles. Only `service_role`
can write — used exclusively by the `validate-score` Edge Function after
it successfully replays the client's submitted move history against the
authoritative seed. A client cannot write a forged score to the leaderboard.

**Consequences you must preserve:**

- Never add client-write policies to `games`.
- Never accept a client-reported score as authoritative. The server
  computes it independently. The client displays its own number during
  play; the server's returned number is what gets stored.
- Don't add Edge Functions that bypass `verify_jwt` AND skip auth checks
  in code. Current `validate-score` does skip gateway JWT verification
  (ES256 workaround — see `memory/project_gapplet_edge_function_jwt.md`)
  but calls `auth.getUser()` internally to identify the player.

Practice-mode games (`?practice=1` URL param) do NOT hit the database at
all. They're pure local play. Don't add a "save my practice history"
feature to the games table — spin up a separate table if needed.

## Daily seed model

Every player globally gets the same seed on a given UTC calendar date.
FNV-1a hash of the `YYYY-MM-DD` string, modulo the `ELIGIBLE_SEEDS` array
length. Same code runs client and server.

The eligible-seed pool is pre-baked by `scripts/generate_seeds.mjs` (ENABLE
5-letter ∩ popular.txt, filtered to ≥8 one-swap neighbors — currently
1,251 seeds, ~3.4 years of unique dailies). Regenerate via the script
whenever wordList.ts changes. **Changing the pool after launch re-rolls
every past daily seed** — lock in before public deploy.

## Directory layout

```
gapplet/
├── CLAUDE.md                          # this file
├── README.md                          # human-facing
├── docs/
│   ├── DESIGN.md                      # rationale for non-obvious decisions
│   ├── DICTIONARY.md                  # dictionary + seed pool regeneration
│   └── ROADMAP.md                     # pointer to live task list
├── scripts/
│   └── generate_seeds.mjs             # regenerates src/lib/eligibleSeeds.ts
├── src/
│   ├── main.tsx                       # entry, wraps App in <AuthProvider>
│   ├── App.tsx                        # game orchestrator — state, timer, keyboard
│   ├── index.css                      # Tailwind + CSS variable palette
│   ├── vite-env.d.ts
│   ├── lib/                           # isomorphic (browser + Deno)
│   │   ├── game.ts
│   │   ├── dictionary.ts
│   │   ├── wordList.ts
│   │   ├── seeds.ts
│   │   ├── eligibleSeeds.ts           # pre-baked, DO NOT hand-edit
│   │   ├── letterValues.ts
│   │   ├── supabase.ts                # browser-only: client singleton
│   │   └── auth.tsx                   # browser-only: AuthProvider + useAuth
│   └── components/
│       ├── Board.tsx                  # the 5-tile board
│       ├── Stats.tsx                  # Time / Score / Chain / Paths(dev)
│       ├── VirtualKeyboard.tsx        # on-screen keyboard (mobile)
│       ├── GameOver.tsx               # end-of-game card + leaderboard host
│       ├── Leaderboard.tsx            # daily top-20 + overflow row
│       ├── ShareButton.tsx            # spoiler-free emoji timeline
│       ├── AuthButton.tsx             # header sign-in indicator
│       ├── SignInModal.tsx            # Google / GitHub / email magic link
│       └── HowToPlay.tsx              # 6-slide tutorial (auto-opens first visit)
├── supabase/
│   ├── config.toml                    # includes [functions.validate-score] verify_jwt=false
│   ├── migrations/                    # numbered SQL — applied via `supabase db push`
│   └── functions/
│       └── validate-score/
│           └── index.ts               # Deno — imports ../../../src/lib/*
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts                     # port 5174
└── .env.local                         # gitignored: VITE_SUPABASE_URL, _PUBLISHABLE_KEY
```

## Dev workflow

```bash
npm install
npm run dev                            # http://localhost:5174
PATH="/opt/homebrew/bin:$PATH" npm ... # if npm isn't on your shell PATH
                                       # (Joe's Mac has Node via Homebrew;
                                       # Claude Code's bash doesn't source ~/.zshrc)

# After changing supabase/migrations/*.sql:
supabase db push                       # applies to linked remote project

# After changing supabase/functions/validate-score/index.ts OR any src/lib/* it imports:
supabase functions deploy validate-score

# After swapping the dictionary:
node scripts/generate_seeds.mjs        # regenerates src/lib/eligibleSeeds.ts
```

The Supabase CLI stores access tokens in the Mac Keychain after
`supabase login`. Don't ask Joe for his DB password — direct DB access
isn't needed for the workflows above.

Supabase project ref: `gzfqczlzkestfmrpawxy`. Details in
`memory/project_gapplet_service_accounts.md`.

## What NOT to do

- **Don't weaken the anti-cheat invariant.** No client-write RLS on
  games. No accepting client-reported scores. Re-read the section above.
- **Don't change canonical game rules without flagging as a question.**
  Scoring formula, chain behavior, star-move doubling, hint budget, edge
  space, single-letter A/I rule — all are deliberate and iterated.
  Surface proposed changes before implementing.
- **Don't commit secrets.** `.env.local` and `supabase/.temp/` are
  gitignored — respect that. Never paste Joe's Supabase DB password or
  OAuth client secrets into code or commits.
- **Don't add new UI libraries.** Plain React + Tailwind v4. No
  shadcn/ui, no MUI, no Radix, no form libraries. The visual surface is
  small and hand-rolled is fine.
- **Don't skip `verify_jwt = false` + `auth.getUser()` pattern for new
  Edge Functions.** ES256 signing keys still trip the gateway's legacy
  JWT verifier. Pattern documented in
  `memory/project_gapplet_edge_function_jwt.md`.
- **Don't split history.moves into a separate table** without surfacing
  as a design discussion. Current JSONB-in-row design is intentional
  and works for ~20 moves/game.

## Code style

- **Named exports.** Avoid default exports except React components.
- **Pure functions in `src/lib/`.** No React imports, no side effects,
  no browser or Node APIs. If you need to add state or I/O, it doesn't
  belong in lib.
- **Components in `src/components/`.** Props in, JSX out. Side effects
  (timer, listeners, submission) live in `App.tsx`, which is over 600
  lines and growing — that's currently OK, but splitting into custom
  hooks is a fine refactor when it becomes unwieldy.
- **Types:** `type` over `interface` unless you need `extends`.
- **Tailwind classes inline in JSX.** If a class list exceeds ~8 items
  or has conditional logic, extract to a named const at the top of the
  file. Don't introduce `clsx` / `classnames` for fewer than 3 sites.
- **Inline styles for CSS-variable consumption.** Component-specific
  palette values (`var(--gapplet-*)`) are easier to read as inline
  style props than in Tailwind utilities.

## Commit style

Small, focused, one logical concern per commit. Multi-sentence body
explaining the **why**, not just the what. Add:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Example body shape:

```
feat(auth): wire Supabase auth into React app (task #6 code path)

Code-side complete; provider credentials still need configuration in
the Supabase/Google/GitHub dashboards before the flow works e2e.
Details in the commit that follows.
```

Task IDs (e.g., `task #6`) cross-reference the live task list — include
them when a commit closes or advances a task.

## When stuck

Ask. Joe would rather answer a design question than receive a
plausible-looking wrong implementation. If you're not sure whether a
change would violate the anti-cheat invariant, the canonical game rules,
or the isomorphic constraints on `src/lib/*` — surface it as a question
before writing code.
