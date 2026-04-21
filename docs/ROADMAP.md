# Roadmap

Prioritized next steps. Top items are the ones that unblock the most
subsequent work or give the most value per hour.

## Phase 1: Make it real (1-2 sessions)

These are the tasks that move Gapplet from "works on my machine" to
"production-ready MVP."

### 1. Get the dev server running

```bash
cd gapplet
npm install
npm run dev
```

Should start Vite on port 5174 and show the game at http://localhost:5174.
If something doesn't work on first boot, fix it before moving on — later
tasks assume this works.

### 2. Swap in a real dictionary

See `docs/DICTIONARY.md`. Replace `src/data/words.txt` with ENABLE
(filtered to 1-5 letter words). Expected outcome: no more "QUARK isn't a
word" surprises.

Verification: play a full 2-minute game and note any word you thought
was valid that got rejected. If the count is zero, the dictionary is
good enough.

### 3. Add Vitest and write tests for `src/lib/game.ts`

The prototype had no tests. Before adding more logic, lock down the
behavior of the pure functions.

Priority test cases:

- `validateBoard` for 0-space, 1-space, 2-space inputs
- `validateBoard` for the single-letter A/I exception
- `findNeighbors` counts match manual inspection for a known seed
- `scoreMove` vs `scoreHintedMove` math on specific boards
- `countDiffs` and `boardKey` edge cases

### 4. Deploy somewhere

Vercel, Netlify, or GitHub Pages. Gapplet has no backend so deployment
is just "put the `dist/` folder on a CDN."

Why this matters now: the "viral" hook of a daily puzzle requires a
public URL that survives past your dev machine. Deploy early so the
link is stable.

## Phase 2: The viral hook (2-3 sessions)

### 5. Daily seed

Replace `pickSeed()` in `src/lib/seeds.ts` with a deterministic function
keyed on UTC date:

```typescript
export function dailySeed(date = new Date()): string {
  const dayNumber = Math.floor(date.getTime() / 86400000);
  return ELIGIBLE_SEEDS[dayNumber % ELIGIBLE_SEEDS.length];
}
```

The seed rotates once per UTC day and everyone playing on that day gets
the same starting word. This is the precondition for social sharing —
"Gapplet 2026-04-21: I got 847" only works if there's a shared puzzle.

Keep a "random seed" mode available for replay after the daily is done.

### 6. Share button

After a game ends, add a "Share" button that copies a string like this
to clipboard:

```
Gapplet 2026-04-21
Score: 847 • Chain: ×4.4 • Moves: 14
🟩🟩🟩🟩🟩🟨🟩🟩🟩🟩🟥🟩🟩🟩
https://gapplet.joecorn.com
```

Green squares for normal moves, yellow for hints, red for chain breaks.
The URL at the end is the hook — it's how non-players see the game and
decide to try it.

Critical: the share string must **not** reveal the seed word or any
played words. Just emoji and numbers. Spoiler-free is what makes the
share socially acceptable.

### 7. Personal stats (localStorage)

Track across games: total plays, personal best score, current streak,
longest chain ever. Show on the start screen and after each game.

Storage schema (keep it simple):

```typescript
type GappletStats = {
  gamesPlayed: number;
  bestScore: number;
  bestChain: number;
  currentStreak: number;
  lastPlayedUtcDay: number;
};
```

## Phase 3: Polish (ongoing)

### 8. Subtle audio

A soft "click" on valid move, a lower "thud" on invalid. Tiny WAV files,
played via `Audio()`, no library needed. Keep it muted by default with
an easy toggle.

### 9. Success animation

Brief cell-pulse on a successful move. CSS keyframes, 200ms, no
dependencies.

### 10. Mobile keyboard

When the game detects mobile (or any tap on the board shows no physical
keyboard handling), render an on-screen QWERTY. See Wordle's approach —
3 rows, enter and delete on the side.

### 11. Accessibility pass

- Screen reader announcements on valid/invalid moves
- Keyboard-only navigation (tab to cells, arrow keys, enter to submit)
- Color-blind-safe hint/selected/idle distinction (currently relies on
  amber vs blue, which fails for some users — add pattern or icon)

## Phase 4: Beyond MVP

These are "maybe someday" ideas, not commitments.

### 12. Difficulty modes

- Easy: 3-minute clock, 5 hints
- Normal: 2-minute clock, 2 hints (current)
- Hard: 90-second clock, 0 hints, 6-letter board

### 13. Themed weekly puzzles

Monday = animals (seeds biased toward animal names). Friday = food.
Purely cosmetic — the game mechanic doesn't change. Requires a
category-tagged seed list.

### 14. Friends mode

Send a friend your exact seed + chain via URL parameter. They try to
beat your score on the same puzzle. Pure client-side — the URL is the
state.

### 15. Anthropic-embedded variant

For fun: a variant where the Claude API suggests hints instead of
picking random legal neighbors. Would need the Anthropic SDK, likely
would need a tiny backend to hide the API key. Reserve for if Gapplet
actually goes anywhere.

## Out of scope (on purpose)

Things explicitly not on the roadmap:

- Accounts, passwords, user profiles
- Server-side leaderboards
- Microtransactions / ads
- Native mobile apps
- Integration with Anthropic products or CredentialTrax

Keep Gapplet small, fun, and unencumbered.
