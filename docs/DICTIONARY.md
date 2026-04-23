# Dictionary

## Current state

`src/lib/wordList.ts` embeds ~13,553 words as a plain string constant
(`WORDS_TEXT`), generated from the public-domain ENABLE word list filtered
to 1–5 letter words and passed through a slur/obscenity blocklist.

## Regeneration

Two scripts, run in order:

```bash
node scripts/generate_wordlist.mjs    # ENABLE → filter → wordList.ts
node scripts/generate_seeds.mjs       # wordList.ts → eligibleSeeds.ts
```

`generate_wordlist.mjs`:
1. Fetches ENABLE from `dolph/dictionary` (cached at `/tmp/enable.txt`)
2. Filters to 1–5 letter uppercase-alpha words
3. Applies the blocklist at `scripts/blocklist.txt`
4. Writes `src/lib/wordList.ts`

Typical output: ~13,553 words, ~76KB as a `.ts` string constant.

ENABLE does not contain any 1-letter entries — the game's "A" and "I"
rule is enforced by `isWord()` regardless of what the dictionary holds.

### About the source (ENABLE)

The **ENABLE2K** word list contains ~173,000 words and is the de-facto
free Scrabble-friendly dictionary. Public domain.

- GitHub mirror: https://github.com/dolph/dictionary (file: `enable1.txt`)
- Also available from Norvig's corpus collection

### About the blocklist

`scripts/blocklist.txt` is a copy of the English list from
[LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) —
a community-maintained list of slurs and obscene terms. At ENABLE ∩
1–5 letters, the blocklist's effective size is ~54 exact matches
(well-known slurs plus common sexual/vulgar vocabulary). See the
generator's console output for the live list when you regenerate.

**Why both dictionary AND seed filtering matter:** the dictionary filter
means players can't play a blocked word as a move (server-side replay
would reject it). The seed filter is derivative — since the seed pool
is computed from the filtered dictionary, blocked words are automatically
excluded as possible daily puzzles too. The anti-cheat invariant
(server validates every move) means the blocklist is enforced on both
client and server without extra work.

**To allow a specific blocked word back in:** edit `scripts/blocklist.txt`
and remove the line for that word, then rerun both regeneration scripts
and redeploy the Edge Function (`supabase functions deploy validate-score`)
since it bundles `wordList.ts`.

**⚠️ Changing the blocklist or the source dictionary rerolls every past
daily seed** (FNV-1a hash modulo the new pool size). Lock composition
before public launch; after that, only add to the blocklist in response
to real complaints, accept the small seed-rotation consequence, or keep
a static override list for specific corrections.

### After regenerating wordList.ts: regenerate the seed pool too

The daily-puzzle seed pool lives in `src/lib/eligibleSeeds.ts`, also
pre-baked (not computed at runtime — matters for Edge Function cold
starts). When `wordList.ts` changes, regenerate the seed pool via:

```bash
node scripts/generate_seeds.mjs
```

The script:
1. Reads `src/lib/wordList.ts` for the dictionary
2. Fetches/reads `popular.txt` from `dolph/dictionary` (curated common-
   words subset, ~25k entries) — cached at `/tmp/popular.txt`
3. Intersects ENABLE 5-letter words with the popular subset
4. Keeps only words with ≥8 valid one-swap neighbors in ENABLE
5. Writes `src/lib/eligibleSeeds.ts` with the sorted, deduped array

Current output: ~1,251 seeds. That's ~3.4 years of unique daily puzzles
at one seed per UTC day. Bump `MIN_NEIGHBORS` in the script to tighten
toward recognizability; lower it toward variety. **Changing the pool
re-rolls every past daily seed — lock in before any leaderboard goes
live.**

### Option 2: TWL (Tournament Word List)

Used in North American Scrabble tournaments. Slightly smaller than
ENABLE (~178,000 total words, with ~8,000 at 1-5 letters). Similar
licensing situation (public domain / widely redistributed).

### Option 3: Custom curated list

Probably not worth it. A curated list is ongoing maintenance and will
always have gaps. Use a standard list and occasionally add
domain-specific additions.

## Implementation notes

The word list lives in `src/lib/wordList.ts` as a plain TypeScript module
exporting `WORDS_TEXT` (one word per newline). `src/lib/dictionary.ts`
parses that string into a `Set<string>` lazily on first lookup.

This shape was chosen so the same file can be imported natively by:

- The browser via Vite (no `?raw` import needed)
- Supabase Edge Functions via Deno (no platform-specific loader)

The server needs the same dictionary to validate scores authoritatively
(see `docs/DESIGN.md` for why we don't trust client-reported scores).
Having one `.ts` module means there is exactly one source of truth.

A 10,000-word list is roughly 60KB as a string constant — small enough
to ship in both the main browser bundle and the Edge Function bundle.
A full 170,000-word ENABLE list is roughly 1.8MB, which is too large
for either target. If you ever need the full list:

1. Keep a small "common words" subset in wordList.ts (so the game is
   playable instantly on cold-start)
2. Fetch the full dictionary async on page load (client) / from Postgres
   on cold-start (Edge Function)
3. Swap the internal Set once the fetch completes

For 1-5 letter words only, the inline approach is fine.

## Why only 1-5 letter words

The game board is always 5 cells. The longest possible entry is a
5-letter word (no space). The shortest valid entries are:

- 5-letter word: 5 letters
- 4-letter + space: 4 letters, but the word itself is 4 chars
- 3-letter + space + 1: 3-letter word and an A or I
- 2-letter + space + 2-letter: two 2-letter words
- 1-letter + space + 3-letter: A or I, plus a 3-letter word

So we need words of lengths 1, 2, 3, 4, and 5. Anything longer than 5
cannot appear on the board and should be filtered from the dictionary to
save memory and lookup time.

## Testing dictionary coverage

After a dictionary swap, sample `pickSeed()` a few times to spot-check
the eligible-seed pool:

```typescript
import { pickSeed } from './src/lib/seeds';
const seen = new Set<string>();
for (let i = 0; i < 500; i++) seen.add(pickSeed());
console.log(`${seen.size} distinct seeds observed`);
```

With the current ~6,650-word list you should see around 50-80 distinct
seeds. With a full ENABLE subset you should see several hundred. If the
number drops unexpectedly, something went wrong in the dictionary
conversion.

## Known gaps in the current list

These are words the prototype already revealed as missing. Add them
manually if keeping the current list:

- QUARK (added in v4 of the prototype)
- QUITE (added in v4)
- Many common 5-letter plurals and past tenses

The long-term fix is to swap to ENABLE, not to keep patching this list.
