# Gapplet

A two-minute word-chain game. Daily shared puzzle. Swap one letter at a
time, build the longest chain you can, and — if you're signed in — post
your score to the global leaderboard.

Play live at `gapplet.joecorn.com` *(deploy pending)*.

## Concept

The board has **5 cells**. Each cell holds either a letter or a space
(the "gap" in Gapplet). A board is valid when it reads left-to-right as
any of:

- One 5-letter word, no space: `HEART`
- A 4-letter word with one edge space: `·CARS` or `CARS·`
- Two valid words split by one interior space: `A·CATS` (1+3),
  `ON·OF` (2+2), `CAT·A` (3+1)

Two or more spaces is never valid. Single-letter "words" are restricted
to `A` and `I` — no `O`, no `K`, even though some Scrabble dictionaries
include them.

Each turn the player **changes exactly one cell** — swaps a letter,
turns a letter into a space, or turns a space into a letter. The result
must validate per the rules above.

## Scoring

Each valid move earns `round(boardPoints × chainMultiplier)`, where:

- `boardPoints` = sum of Scrabble letter values on the board (spaces = 0)
- `chainMultiplier` starts at 1.0 and **advances by +0.2** per normal
  successful move.
- **Star moves** (creating a space at the interior — position 2, 3, or
  4) double the chain multiplier instead of advancing it. No cap.
- Hinted moves hold the chain (no advance) and subtract the newly-placed
  letter's Scrabble value from the earned points.
- Invalid moves, repeated configurations, or multi-cell changes **reset
  chain to 1.0** but do not reduce score.

Letter values come straight from Scrabble (A=1, E=1, Q=10, Z=10) — see
`src/lib/letterValues.ts`.

## Mechanics

- **Clock** is 2:00 (120 seconds). Starts when the player first taps a
  board cell, not on page load. Reading the seed is free.
- **Paths** (live count in the header stats): how many unused one-swap
  neighbors you have from your current committed board. Watch it drop
  as you play; it jumps when you commit an edge-space or interior-split
  move that opens up a new region of the word graph. Hidden (muted) in
  hard mode.
- **One-cell-change-per-move** is strict; changing more than one cell
  invalidates (except Remove, below — handled as one logical move).
- **Remove (⌫)**: selecting a letter cell and pressing Backspace (or the
  ⌫ key on the on-screen keyboard) shifts everything right of it one
  position left and appends a trailing space. E.g. `HEARD` with `A`
  selected → `HERD·`.
- **Restart Chain (the broken-chain button at the top of the keyboard):
  returns the board to the seed word. Chain resets to ×1.0, but every
  configuration you've already played stays blocked — you must find a
  different first move. Two uses: escape a dead-end, or strategically
  abandon a branch that isn't panning out.
- **Revert (Esc)**: undo uncommitted edits only. Chain and score
  unchanged. Pre-commit safety net.
- **Buy a guess (hints)**: one per minute of play, no stacking. Hint
  budget is window-based (minute-1 hint expires at 1:00 if unused).
  Hints never create interior space splits — no hint-farming the star
  mechanic.
- **Repeated board configurations** break the chain. Can't cycle through
  the same states to farm points.

## Daily shared puzzle

Every player globally plays the same seed on a given UTC date. The seed
rotates at 00:00 UTC. Your first completed game of the day counts for
the leaderboard. Replay for practice via `?practice=1` — practice games
don't post.

Pool size is ~1,250 seeds (~3.4 years of unique dailies). Generated from
ENABLE 5-letter words intersected with the dolph/dictionary `popular.txt`
subset, filtered to ≥8 one-swap neighbors. See `docs/DICTIONARY.md`.

## End-of-game

When the clock hits 0 or you run out of valid moves:

- **Submission badge** shows the server-verified score (if you're signed
  in), or a prompt to sign in.
- **Share button** copies a spoiler-free emoji timeline to the clipboard
  (or opens the mobile native share sheet). The emoji cascade:
  🟦 restart, 🟥 dead-end, 🟢 star move, 🟨 hint, 🟩 normal.
- **Full chain** shows every committed move — previous → new board
  transition, score, multiplier after the move, and a ⭐ marker on
  star-move rows.
- **Today's leaderboard** shows the top 20 and, if you're outside it,
  your own row with its true rank.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS v4
- **Backend:** Supabase — Auth (Google / GitHub / email magic link),
  Postgres (`profiles` + `games` + leaderboard views),
  Edge Functions (`validate-score`, Deno runtime)
- **Planned hosting:** Vercel for the static frontend, Hostinger for DNS
  (`gapplet.joecorn.com`)

The `src/lib/*` module tree is intentionally isomorphic — the same files
that run in the browser also import into the Edge Function so the server
can replay move histories using identical scoring logic. That's the
foundation of the anti-cheat model: clients can't write to the `games`
table directly; only the Edge Function (running as `service_role`) can,
and it only does so after a clean replay.

## Development

```bash
npm install
npm run dev      # http://localhost:5174
npm run build
npm run preview

# Regenerate the seed pool after swapping the dictionary:
node scripts/generate_seeds.mjs

# Apply DB migrations:
supabase db push

# Deploy the Edge Function:
supabase functions deploy validate-score
```

You need `.env.local` with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. Template in `.env.example`.

## Project structure

```
gapplet/
├── README.md
├── CLAUDE.md                          # AI-session onboarding
├── docs/
│   ├── DESIGN.md                      # rationale for non-obvious decisions
│   ├── DICTIONARY.md                  # dictionary + seed-pool regeneration
│   └── ROADMAP.md                     # current status + pointer to task list
├── scripts/
│   └── generate_seeds.mjs             # regenerates eligibleSeeds.ts
├── src/
│   ├── main.tsx                       # entry, wraps App in <AuthProvider>
│   ├── App.tsx                        # game orchestrator
│   ├── index.css                      # Tailwind + palette CSS variables
│   ├── lib/                           # isomorphic (browser + Deno Edge Function)
│   │   ├── game.ts                    # validate, neighbors, scoring, chain
│   │   ├── dictionary.ts              # isWord() over WORDS_TEXT
│   │   ├── wordList.ts                # ENABLE 1-5 letter words (bundled string)
│   │   ├── seeds.ts                   # pickSeed / pickSeedForDate / todaySeed
│   │   ├── eligibleSeeds.ts           # pre-baked; regenerate via script
│   │   ├── letterValues.ts            # Scrabble values + SPACE constant
│   │   ├── supabase.ts                # browser-only: client singleton
│   │   └── auth.tsx                   # browser-only: AuthProvider + useAuth
│   └── components/
│       ├── Board.tsx                  # 5-tile board
│       ├── Stats.tsx                  # Time / Score / Chain / (dev) Paths
│       ├── VirtualKeyboard.tsx        # on-screen mobile keyboard
│       ├── GameOver.tsx               # end-of-game card
│       ├── Leaderboard.tsx            # daily top-20 + overflow row
│       ├── ShareButton.tsx            # spoiler-free emoji timeline
│       ├── AuthButton.tsx             # header sign-in indicator
│       ├── SignInModal.tsx            # provider picker
│       └── HowToPlay.tsx              # 6-slide tutorial
├── supabase/
│   ├── config.toml                    # per-function verify_jwt overrides
│   ├── migrations/                    # SQL migrations, timestamped
│   └── functions/
│       └── validate-score/
│           └── index.ts               # Deno Edge Function
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

See `docs/DESIGN.md` for the non-obvious decisions that are deliberate
and shouldn't be casually reversed.
