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
words, and enough room for 2+2 or 1+3 splits when a space is present.

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
- Per-move advance: +0.2
- Cap: ×5.0 (reachable after 20 good moves — theoretically possible in
  2 minutes, practically very hard)
- Reset: any invalid move, any multi-cell change, any repeated
  configuration

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

## No dark mode (yet)

The prototype is light-themed. Dark mode is a reasonable addition but
was deferred: getting the game mechanic right took priority, and dark
mode is a pure theming task that can be bolted on later without any
logic changes.

## No mobile-specific UI (yet)

The game works on mobile but relies on the physical keyboard for letter
entry. An on-screen 26-key keyboard would be a significant addition —
it needs layout logic, touch handling, and screen-real-estate tradeoffs.
Deferred until the core game is polished enough to be worth the work.

## No backend, ever (probably)

Gapplet is intentionally client-only. No accounts, no server leaderboards,
no telemetry. Reasons:

- **Lower friction to share.** A static HTML page can be hosted anywhere
  for free and linked freely.
- **No maintenance burden.** Anthropic already runs one SaaS
  (CredentialTrax); Joe doesn't need a second.
- **Privacy.** No user data = no user data problems.

If Gapplet ever needs persistent state (personal best, streak), use
`localStorage`. If it ever needs daily global stats, use a static daily
file generated from a GitHub Action — still no "real" backend.
