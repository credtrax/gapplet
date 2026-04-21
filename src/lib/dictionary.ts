/**
 * Dictionary loading and lookup.
 *
 * In the prototype the dictionary was a hardcoded string constant inside the
 * HTML file. Here we import it as a raw text file via Vite's ?raw suffix,
 * which means the build pipeline handles it and we don't have to manage
 * network loading or parse timing.
 *
 * For production: replace words.txt with a real dictionary like ENABLE
 * (~170,000 words). See docs/DICTIONARY.md.
 */

// The `?raw` suffix is a Vite-specific import assertion that gives us the
// file contents as a string rather than processing it. If this looks
// unfamiliar: it's how Vite lets you inline arbitrary text files at build
// time.
import rawWords from '../data/words.txt?raw';

/**
 * The dictionary, as an immutable Set for O(1) membership checks.
 * Words are uppercase. Loaded once at module init.
 */
export const DICT: ReadonlySet<string> = new Set(
  rawWords
    .split(/\s+/)
    .map((w) => w.trim().toUpperCase())
    .filter((w) => w.length >= 1 && /^[A-Z]+$/.test(w))
);

/**
 * Check whether a word is in the dictionary.
 *
 * Handles the single-letter edge case: only "A" and "I" are accepted as
 * one-letter words. Other one-letter strings reject even if they appear
 * in some dictionaries (O, K, etc.) — this is a deliberate game-design
 * choice, not a dictionary limitation.
 */
export function isWord(word: string): boolean {
  const upper = word.toUpperCase();
  if (upper.length === 1) {
    return upper === 'A' || upper === 'I';
  }
  return DICT.has(upper);
}
