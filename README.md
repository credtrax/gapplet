# Gapplet

A two-minute word-chain game. Start with a seed word, change one cell at a time,
build the longest valid chain you can.

## Concept

The board has **5 cells**. Each cell holds either a letter or a space (the "gap"
in Gapplet). The cells read left-to-right as either:

- One 5-letter word: `HEART`
- Two valid words split by one space: `ON OF` (2+2), `A CAT` + a filler... wait,
  let me restate: with one space, the 4 remaining letters form two words, split
  at the space. Valid arrangements: 1+3 (e.g. `I CAT` + space in position 2,
  giving `I CAT.` which is really `I·CATS`-style — see `validateBoard()` for the
  canonical rule), 2+2, 3+1.

Each turn the player **changes exactly one cell** — swaps a letter, turns a
letter into a space, or turns a space into a letter. The result must validate
(single word or two-words-split-by-space).

## Scoring

Each valid move earns `round(boardPoints × chainMultiplier)`, where:

- `boardPoints` = sum of Scrabble letter values on the board (spaces = 0)
- `chainMultiplier` starts at 1.0, advances by 0.2 per successful non-hint move,
  caps at 5.0
- Invalid moves, repeated configurations, or multi-cell changes **reset chain to
  1.0** but do not reduce score

Scrabble letter values are used verbatim (A=1, E=1, Q=10, Z=10, etc.) — see
`src/lib/letterValues.ts`.

## Rules

1. **Clock** is 2:00 (120 seconds). Clock starts when the player first
   interacts with the board (click a cell or type a letter), not when the game
   is dealt. This gives thinking time to read the seed.
2. **One-cell-change-per-move** is strict. Changing more than one cell invalidates.
3. **Repeated board configurations** break the chain (you can't cycle through
   the same states to farm points).
4. **Single-letter "words"** allowed only for `A` and `I`. Other single-letter
   entries reject.
5. **"Buy a guess"** hints: one per minute of play, no stacking. If unused in
   minute 1, it does not carry over to minute 2. Hints cost the Scrabble value
   of the newly-placed letter (subtracted from the move's earned points) and do
   **not** advance the chain multiplier.
6. **Seeds** are pre-filtered algorithmically: only seeds with ≥10 valid
   one-swap neighbors in the dictionary are eligible. This avoids dead-end
   seeds like QUICK that have almost no play surface.

## End-game

When the clock hits 0, a "Game over" panel shows:

- Final score, total moves, number of hinted moves
- The seed word
- The complete chain — every move, the board state, the word(s) it formed, the
  points earned, and `[hint • min N]` tags for hinted moves

## Current status

This is an **early MVP prototype**. It works end-to-end, but is missing several
things that would make it genuinely viral:

- [ ] Larger dictionary (currently ~4,500 words; production target is ENABLE
      or TWL at ~170,000 words). See `docs/DICTIONARY.md`.
- [ ] Daily seed (same puzzle for everyone that day, UTC-based) — required for
      the Wordle-style social-sharing hook
- [ ] Share button that outputs a spoiler-free result string
- [ ] Personal best / statistics persistence (localStorage)
- [ ] Sound effects and subtle animations on successful moves
- [ ] Mobile-friendly on-screen keyboard (currently relies on physical keyboard
      for letter entry)
- [ ] Proper test suite (Vitest)
- [ ] Production build pipeline and deployment

## Stack

- **Vite** for dev server and bundling
- **React 18** + **TypeScript** for the UI
- **Tailwind CSS v4** for styling
- No backend, no database, no accounts. All state is client-side.

This mirrors the CredentialTrax frontend stack deliberately, so Joe's muscle
memory applies.

## Development

```bash
npm install
npm run dev      # starts on http://localhost:5173
npm run build    # production bundle to dist/
npm run preview  # serves the production build locally
```

## Project structure

```
gapplet/
├── README.md                    # this file
├── docs/
│   ├── DESIGN.md                # design rationale and open questions
│   ├── DICTIONARY.md            # notes on the dictionary problem
│   └── ROADMAP.md               # prioritized next steps
├── src/
│   ├── main.tsx                 # entry point
│   ├── App.tsx                  # game component (the whole UI)
│   ├── index.css                # Tailwind imports + custom styles
│   ├── lib/                    # isomorphic — runs in browser AND Deno (Edge Functions)
│   │   ├── wordList.ts          # dictionary source, embedded as a string export
│   │   ├── letterValues.ts      # Scrabble letter values
│   │   ├── dictionary.ts        # lazy-init Set + isWord() over wordList
│   │   ├── game.ts              # pure game logic (validate, neighbors, scoring)
│   │   └── seeds.ts             # candidate seeds + neighbor-count filter (lazy)
│   └── components/
│       ├── Board.tsx            # the 5-cell board
│       ├── Stats.tsx            # time/score/chain cards
│       ├── Controls.tsx         # submit/space/hint/reset buttons
│       └── GameOver.tsx         # end-of-game summary
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## Design philosophy

The original prototype (in chat with Claude) went through 5 iterations before
this handoff. Key decisions that should not be casually reversed:

1. **Scrabble letter values**, not custom values. Users intuitively understand
   the Scrabble scoring system; reinventing it creates friction.
2. **Chain multiplier rewards flow**, not individual clever plays. This means
   a long chain of simple words beats a single brilliant rare-letter play —
   which is the right bias for a speed game.
3. **Clock doesn't start until interaction.** Reading time is free; you're
   being timed on *playing*, not *reading*.
4. **Hint limit by time-window, not total-count.** "Two per game" would allow
   burning both in minute 1; "one per minute, no stacking" forces strategic
   timing.
5. **The name.** "Gapplet" signals the defining mechanic (the space-as-playable-cell)
   with the cozy `-le` suffix that fits the word-game genre (Wordle, Heardle,
   Quordle).

See `docs/DESIGN.md` for the full reasoning on each.
