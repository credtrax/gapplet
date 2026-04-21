# Dictionary

## Current state

`src/data/words.txt` contains ~6,650 words, hand-curated from the prototype's
embedded string literal. It's enough for a playable game but has obvious
gaps — common words will be missing, and players will run into validation
failures that feel arbitrary ("QUARK isn't a word?!").

## The upgrade

Replace `src/data/words.txt` with a proper dictionary. Options:

### Option 1: ENABLE (recommended)

The **ENABLE2K** word list contains ~173,000 words and is the de-facto
free Scrabble-friendly dictionary. It's in the public domain.

- GitHub mirror: https://github.com/dolph/dictionary (file: `enable.txt`)
- Also available from Norvig's corpus collection

To install:

```bash
curl -o src/data/words.txt https://raw.githubusercontent.com/dolph/dictionary/master/enable.txt
# convert to uppercase, one word per line, filter to 1-5 letter words only
python3 -c "
words = [w.strip().upper() for w in open('src/data/words.txt')]
words = [w for w in words if 1 <= len(w) <= 5 and w.isalpha()]
words = sorted(set(words))
open('src/data/words.txt', 'w').write('\n'.join(words) + '\n')
print(f'Kept {len(words)} words')
"
```

Filtering to 1-5 letter words shrinks the file dramatically (most ENABLE
entries are longer than 5 letters, which we can't use anyway). Expect
roughly 8,000-10,000 useful words after filtering.

### Option 2: TWL (Tournament Word List)

Used in North American Scrabble tournaments. Slightly smaller than
ENABLE (~178,000 total words, with ~8,000 at 1-5 letters). Similar
licensing situation (public domain / widely redistributed).

### Option 3: Custom curated list

Probably not worth it. A curated list is ongoing maintenance and will
always have gaps. Use a standard list and occasionally add
domain-specific additions.

## Implementation notes

The game loads the dictionary via Vite's `?raw` import:

```typescript
import rawWords from '../data/words.txt?raw';
```

This inlines the file into the JS bundle at build time. A 10,000-word
list is roughly 60KB — small enough to ship in the main bundle. A full
170,000-word ENABLE list is roughly 1.8MB, which is too large to inline.

If you use the full ENABLE list, split the loading:

1. Keep a small "common words" subset inlined (so the game is playable
   instantly)
2. Fetch the full dictionary async on page load
3. Swap the DICT Set once the fetch completes

For 1-5 letter words only, inlining is fine.

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

After a dictionary swap, run the seed filter and count eligible seeds:

```typescript
import { ELIGIBLE_SEEDS } from './src/lib/seeds';
console.log(`${ELIGIBLE_SEEDS.length} eligible seeds`);
```

With the current ~6,650-word list you should see around 50-80 eligible
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
