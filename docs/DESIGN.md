# Design rationale

This document captures the non-obvious design decisions made during the
5-iteration chat prototype. It exists so future work on Gapplet doesn't
re-litigate settled questions and so new contributors understand the "why"
behind rules that might initially seem arbitrary.

## The name

**Gapplet** is a portmanteau of "gap" (the space-as-playable-cell — the
defining mechanic) and the `-let` diminutive that fits the word-game genre
(Wordle, Heardle, Quordle, Squabble, Contexto). It signals both the
mechanic and the category in four syllables.

Alternatives considered and rejected: Swaply, Fivesies, Rascal, Cinco,
Shift, Flux, Chameleon. Chameleon was the working name through the first
two iterations but got replaced because it signaled pure speed; once the
space mechanic was added, the game became strategic as well, and the
name no longer fit.

## Five cells, not four or six

Four cells makes the single-space arrangements cramped (1+2 or 2+1 — not
much room to find valid word pairs). Six cells makes the single-word
state too hard (few common English 6-letter words are one-swap neighbors
of each other). Five is the sweet spot: Wordle territory for single
words, and enough room for the full variety of space-placements when a
space is present: edge (4-letter word plus leading or trailing space),
1+3, 2+2, and 3+1 splits.

## Scrabble letter values, verbatim

Not a custom scoring system. Reasons:

1. **Familiarity.** Millions of people already know that Q and Z are 10.
   Introducing a custom system adds a learning curve for zero gain.
2. **Calibration.** Hasbro/Mattel spent decades tuning these values
   against actual English letter frequency and word formation. Our
   homegrown numbers would be worse.
3. **Meme-ability.** "Scrabble scoring + chains" is a sentence anyone can
   understand. "Custom frequency-weighted alphabetic scoring" is not.

## Chain multiplier, not single-move brilliance

The chain multiplier rewards *flow* — sustained play without errors —
rather than single clever moves. A 20-move chain of simple words beats a
single brilliant Q/Z play because the multiplier compounds.

This bias is deliberate: in a 2-minute game, we want players trying to
stay in the groove, not stopping to plan a single perfect move. Speed
word games that reward pausing to think always devolve into anxiety.

Chain parameters:

- Start: ×1.0
- Per-move advance: +0.2 on normal valid moves
- **Star move (interior space created): doubles the chain** (see next
  section)
- **No cap** (removed 2026-04-22). Stacked star moves can push the chain
  arbitrarily high; this keeps the mechanic rewarding all the way up.
- Reset: any invalid move, any multi-cell change that isn't Remove, any
  repeated configuration, or an explicit Restart Chain.

## Star moves — interior-space doubling

When a move creates a space at an interior position (index 1, 2, or 3 —
any position other than the two edges), the chain multiplier **doubles**
instead of advancing by the usual +0.2. Example: `ADMIT` with the `M`
replaced by a space → `AD·IT` validates as two words (`AD` + `IT`) and
the chain goes ×1.4 → ×2.8 in one move.

Why this mechanic exists: interior splits require the player to
simultaneously hold a valid word on either side of the space, which is
meaningfully harder than a letter-for-letter swap. Without a dedicated
reward, the effort isn't worth the risk. Star moves give the game a
signature high-reward moment absent from Wordle and Scrabble alike.

Why the cap was removed: with star moves capped at ×5.0, skilled players
hit the ceiling quickly and the doubling stops mattering. Removing it
makes the top end of the score distribution a real incentive to keep
pushing.

Hints are **filtered** to never create interior splits. Hint-suggested
moves freeze the chain anyway (no doubling, no +0.2), but a hinted
interior split would leave the player sitting on a fat multiplier
setup without the effort of finding it. The filter closes that off at
the hint selector; the Edge Function also rejects any hinted move whose
delta matches an interior-split pattern (defense in depth).

## Chain breaks on repeated configuration, not repeated word

The rule is: "the 5-cell board state you just made must not have been
made before in this game." So `HEART → HEARS → HEART` is illegal because
`HEART` was the starting state. But `HEART → HEARS → HEATS → HEART`
would actually be *legal* the first time around; the issue is it wouldn't
be legal on subsequent passes.

This is a looser rule than "no repeated words." We considered tightening
it but decided against: stricter word-repetition rules force players to
memorize what they've played, which adds cognitive load and makes the
game more stressful. Configuration-based repeat detection is mechanical
and the game can enforce it visibly.

## Clock starts on first interaction

The clock holds at 2:00 until the player clicks any cell, types a
letter, or hits the space button. Reading the seed is free; playing is
timed. This prevents the "oh no what's the seed let me read it" tax
that would otherwise make the first 5 seconds of every game feel bad.

Implementation note: **any** interaction starts the clock, not just a
submitted move. The "first click" semantics let players think about
their first move while the clock is already counting — no artificial
pause.

## Hints: one per minute, no stacking

"Two hints per game" would allow burning both in minute one, leaving
minute two unsupported. "One per minute, no stacking" forces strategic
timing: save your minute-1 hint for when you're actually stuck.

Implementation: the game splits the 120-second clock into two 60-second
windows. Each window has a budget of 1 hint. Unused budget does *not*
carry over — a player who breezes through minute 1 without hinting
still only gets one hint in minute 2.

## Hint cost: letter value subtraction, no chain advance

A hint reveals a legal next move — it pre-fills one cell with the
letter needed. When the player accepts and submits, they earn
`boardPoints × chain − letterValue`. The chain multiplier does **not**
advance on a hinted move.

This creates a clear tradeoff: hinting a Q (value 10) on a small board
with ×1.2 chain might net zero or near-zero. Hinting a C (value 3) on
a big board with ×3.0 chain is valuable. Players who use hints
strategically (only when the board is fat and the letter is cheap) get
more value than players who hint reflexively.

## Single-letter "words" restricted to A and I

Scrabble allows some other one-letter words in competitive dictionaries
(O, K). We don't. Reason: allowing too many trivial single-letter
splits lets players farm easy points by repeatedly toggling space
positions, which trivializes the game. A and I are enough for the
2+1+2-adjacent splits to feel possible without feeling cheap.

## Algorithmically filtered seeds

Not every 5-letter word is a good seed. QUICK has maybe 3 valid
one-swap neighbors in standard English (QUACK, QUART, QUIRK) because
the QU pair is locked. A seed with 3 neighbors produces a 30-second
game that ends in frustration.

At startup, Gapplet filters its candidate seed list to only keep seeds
with ≥10 valid one-swap neighbors in the current dictionary. This
protects against the "bad seed" experience without requiring manual
curation — when the dictionary grows, more seeds qualify automatically.

## Daily shared puzzle

Every player globally plays the same seed on a given UTC date. This is
the precondition for socially-meaningful sharing: "I got 847 on today's
puzzle" only lands if the reader played the same puzzle.

Implementation: FNV-1a 32-bit hash of the `YYYY-MM-DD` string, modulo
the pre-baked `ELIGIBLE_SEEDS` array. Same function runs client and
server — the isomorphic `src/lib/seeds.ts` ensures they agree on which
seed belongs to which date. Deterministic, no DB lookup needed.

Eligible-seed pool construction: ENABLE 5-letter words intersected with
`popular.txt` (curated common-words subset), filtered to entries with
≥8 valid one-swap neighbors. Current count: ~1,250 seeds (about 3.4
years of unique dailies before collisions become frequent). Regenerated
via `scripts/generate_seeds.mjs` whenever the dictionary changes.

**Locked once public.** Changing pool composition (lowering the neighbor
threshold, swapping dictionaries) re-rolls every past daily seed. That's
fine pre-launch, destructive post-launch.

## Why we added a backend (reversal of original decision)

The original prototype was pure client-only. That decision got reversed
once the design goal clarified to "daily shared puzzle with a global
leaderboard" — because:

- Leaderboards require persistent comparable data across players.
  localStorage can't share, and a static GitHub-Action file can't accept
  submissions.
- Without server-side score validation, leaderboards are a cheat
  magnet. The moment a public URL exists, someone opens DevTools and
  submits `score: 999999`. The anti-cheat invariant (see CLAUDE.md)
  requires server-side replay, which requires a server.
- The stack chosen (Supabase) imposes very low maintenance overhead —
  no infra to run, free tier is generous, auth is a turnkey feature.
  The "I don't want to run a second SaaS" concern is preserved because
  Supabase runs it.

Practice mode (`?practice=1`) retains the original no-persistence model
— games don't touch the DB. Preserves the "quick replay with no stakes"
experience.

## Mobile-first with an on-screen keyboard

The game ships an on-screen QWERTY keyboard (3 rows of letters, Enter
+ letter cluster + ⌫ on row 3, Space on row 4) because mobile is the
primary target platform. Physical keyboard still works in parallel on
desktop.

Timer rule: tapping a letter key on the on-screen keyboard does NOT
start the clock. Only tapping one of the 5 board cells does. This
preserves the "read the seed for free" UX even with the virtual
keyboard always visible.

## No dark mode (yet)

Deferred. CSS palette is already variables (`--gapplet-bg`, `--gapplet-fg`,
etc.), so the work is essentially adding a `@media (prefers-color-scheme:
dark)` block. Queued, not yet implemented.
