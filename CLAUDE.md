# CLAUDE.md — Context for Claude Code

This file is read automatically by Claude Code when working on Gapplet. It
contains the context that isn't in the README because the README is for humans.

## Who you're working with

Joe (Joseph Corn). He's a Senior Manager at Sam's Club, COO/CTO of Stone and
Spark Collective LLC, and the primary technical builder on CredentialTrax
(a HIPAA-compliant SaaS). Gapplet is a side project for fun — it is NOT part of
the CredentialTrax codebase or the Stone and Spark business. It is a personal
creative diversion.

Joe is a generalist, not a specialist. He programs, but his last daily
programming was in Visual FoxPro 2.6, which means: write code that is readable
and commented, not clever. Prefer verbose explicit code over dense expressions.
When you introduce a modern pattern (hooks, TS generics, async iterators),
briefly explain it in a comment the first time it appears in the codebase.

## What Gapplet is

Read README.md first. The short version: a 2-minute word-chain game where you
start with a 5-letter seed word and swap one cell per move, building the
longest chain of valid words you can. Scoring uses Scrabble letter values and
a chain multiplier.

## Where Gapplet came from

Gapplet was prototyped in 5 iterations inside a chat with Claude, rendered as
inline HTML widgets. The final prototype had:

- Working game loop (validate, score, chain multiplier, repeat-state detection)
- Pre-filtered seed list (algorithmic, by neighbor count)
- "Buy a guess" hint system with 1-per-minute rate limiting
- Full end-game chain history

When the prototype grew beyond what a single HTML file could comfortably hold,
Joe moved it to Claude Code — that's this project.

The prototype's code has been refactored into this Vite/React/TypeScript
project structure. The game logic in `src/lib/game.ts` is a faithful
translation of the prototype's pure-JS functions. The React components in
`src/components/` are new — the prototype used imperative DOM manipulation
directly; now we use React state.

## First tasks

The handoff intentionally leaves several things unfinished because they need
decisions, not just code. In rough priority order:

1. **Dictionary upgrade.** The current `src/lib/wordList.ts` embeds a ~6,650-word
   subset maintained by hand in the prototype. For production, load a real
   dictionary like ENABLE (~170,000 words). See `docs/DICTIONARY.md`.
2. **Get the dev server running.** Run `npm install && npm run dev` and verify
   the game plays end-to-end.
3. **Add Vitest** and write tests for `src/lib/game.ts` — specifically
   `validateBoard`, `findNeighbors`, and the scoring math. The prototype had no
   tests; this is the first thing to fix in a real project.
4. **Daily seed.** Replace `pickSeed()` with a deterministic function that uses
   UTC date as a hash seed, so every player on a given day gets the same
   starting word. This is the precondition for viral sharing.
5. **Share button.** Generate a Wordle-style result string and put it on the
   clipboard when clicked.

Don't start on mobile-friendly input, sounds, or animations until 1–4 are done.

## What NOT to do

- **Don't add a backend.** Gapplet is pure client-side by design. No accounts,
  no leaderboards that require a server, no analytics beyond what Vercel/
  Netlify give you for free.
- **Don't pull in large UI libraries.** We're using Tailwind v4 and plain React.
  No shadcn/ui, no MUI, no Radix — all of that is overkill for a single-screen
  game.
- **Don't break the Scrabble scoring.** It's a deliberate design choice
  (see README). If you think another scoring system would be better, raise it
  as a question before changing.
- **Don't add authentication or user profiles.** If personal stats are needed,
  use localStorage only.

## Code style

- Prefer named exports. Avoid default exports except for React components.
- Pure functions in `src/lib/` — no React imports, no side effects, fully
  testable without mounting anything.
- Components in `src/components/` — receive props, render JSX. Side effects
  (timer, keyboard listeners) belong in `App.tsx` for now; split them out
  later if `App.tsx` exceeds ~300 lines.
- Types: prefer `type` over `interface` unless extending.
- Tailwind classes go directly in JSX. If a class list exceeds ~8 items,
  consider extracting to a `const` at the top of the file or using a small
  helper function — don't use `clsx` or `classnames` unless you're doing
  conditional class logic in 3+ places.

## Commit style

Joe prefers small, focused commits with clear messages. Conventional Commits
format is fine but not required. Example:

```
fix(game): handle space-swap edge case where only-letter word collapses

When a player replaces the last letter with a space, validateBoard should
reject it rather than counting the 3-letter word as a win.
```

## When stuck

Ask. Joe would rather answer a design question than receive a plausible-looking
wrong implementation. "Should hints reveal the highest-scoring or a random
legal move?" is a better message than silently committing one choice.
