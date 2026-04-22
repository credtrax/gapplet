# Dictionary

## Current state

`src/lib/wordList.ts` embeds ~13,607 words as a plain string constant
(`WORDS_TEXT`), generated from the public-domain ENABLE word list filtered
to 1–5 letter words. Regeneration recipe is below. The older ~6,650-word
hand-curated list that web-Claude shipped had obvious gaps (PARKA, QUARK,
common plurals) and has been replaced.

## The upgrade

Regenerate `src/lib/wordList.ts` from a proper dictionary. Options:

### Option 1: ENABLE (recommended)

The **ENABLE2K** word list contains ~173,000 words and is the de-facto
free Scrabble-friendly dictionary. It's in the public domain.

- GitHub mirror: https://github.com/dolph/dictionary (file: `enable.txt`)
- Also available from Norvig's corpus collection

To (re)install / regenerate from scratch:

```bash
curl -sSfL -o /tmp/enable.txt https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
# Filter to 1-5 letter words, uppercase, sorted, dedup — then emit wordList.ts
python3 <<'PY'
words = [w.strip().upper() for w in open('/tmp/enable.txt')]
filtered = sorted({w for w in words if 1 <= len(w) <= 5 and w.isalpha()})
body = '\n'.join(filtered)
with open('src/lib/wordList.ts', 'w') as f:
    f.write('/**\n')
    f.write(' * The Gapplet dictionary, embedded as a plain string.\n')
    f.write(' */\n')
    f.write('export const WORDS_TEXT = `\n' + body + '\n`;\n')
print(f'Wrote {len(filtered)} words to src/lib/wordList.ts')
PY
```

Filtering to 1-5 letter words shrinks the list dramatically (most ENABLE
entries are longer than 5 letters, which we can't use). Typical output:
~13,600 words, ~76KB as a `.ts` string constant. ENABLE itself does not
contain any 1-letter entries — the game's "A" and "I" rule is enforced
by `isWord()` regardless.

**Content note:** ENABLE is public-domain but hasn't been curated to
remove slurs and other words that modern Scrabble dictionaries (TWL06+)
exclude. For a public deploy, apply a content blocklist before shipping
— see the open follow-up task. This is a pre-launch concern, not a
local-dev concern.

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
