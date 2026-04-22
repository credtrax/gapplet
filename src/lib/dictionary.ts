/**
 * Dictionary loading and lookup.
 *
 * The word list lives in ./wordList.ts as a plain string export — that way
 * both the browser (Vite) and Deno (Supabase Edge Functions) can import it
 * natively without Vite's ?raw or any platform-specific import syntax.
 *
 * The parsed Set is lazy-initialized on first use so that importing this
 * module does no work. This matters for Edge Functions, where cold-start
 * latency is measured per import.
 *
 * For production: swap wordList.ts for a larger generator (e.g. ENABLE,
 * ~170k words). See docs/DICTIONARY.md.
 */

import { WORDS_TEXT } from './wordList.ts';

let _dict: Set<string> | null = null;

function getDict(): Set<string> {
  if (_dict === null) {
    _dict = new Set(
      WORDS_TEXT.split(/\s+/)
        .map((w) => w.trim().toUpperCase())
        .filter((w) => w.length >= 1 && /^[A-Z]+$/.test(w))
    );
  }
  return _dict;
}

/**
 * Check whether a word is valid in the game's context.
 *
 * Single-letter edge case: only "A" and "I" are accepted. Other one-letter
 * strings reject even if they appear in some Scrabble dictionaries (O, K, etc.)
 * — this is a deliberate game-design choice, not a dictionary limitation.
 */
export function isWord(word: string): boolean {
  const upper = word.toUpperCase();
  if (upper.length === 1) {
    return upper === 'A' || upper === 'I';
  }
  return getDict().has(upper);
}
