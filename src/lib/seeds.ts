/**
 * Seed selection.
 *
 * The eligible-seed pool is pre-baked in `eligibleSeeds.ts` by
 * `scripts/generate_seeds.mjs`. That script intersects ENABLE 5-letter
 * words with the curated popular.txt subset and filters to entries with
 * ≥8 valid one-swap neighbors. Runtime does no scanning — just indexes
 * into the baked array. Regenerate via the script whenever wordList.ts
 * changes; see docs/DICTIONARY.md.
 */

import { ELIGIBLE_SEEDS } from './eligibleSeeds.ts';

/**
 * Pick a random eligible seed. Used only for "practice mode" — daily
 * shared puzzles are the production flow and use `todaySeed()`. Practice
 * games don't post to the leaderboard.
 */
export function pickSeed(): string {
  if (ELIGIBLE_SEEDS.length === 0) return 'STARE';
  return ELIGIBLE_SEEDS[Math.floor(Math.random() * ELIGIBLE_SEEDS.length)];
}

/**
 * FNV-1a 32-bit hash. Not cryptographic — just a cheap, well-distributed
 * way to map an arbitrary string to a uint32 for modulo-indexing into the
 * eligible-seeds array. Deterministic: same input always gives same output.
 */
function hashString(s: string): number {
  let h = 2166136261; // FNV offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619); // FNV prime; Math.imul keeps 32-bit semantics
  }
  return h >>> 0; // force unsigned
}

/**
 * UTC date as "YYYY-MM-DD". Every player on Earth shares the same date
 * string on a given UTC calendar day, which is the whole point.
 */
export function utcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Deterministic seed for a given UTC date. Same date always yields the
 * same seed. Must agree between client and server (Edge Function) so
 * server-side score validation can replay moves against the authoritative
 * seed. Both runtimes import this file — don't add platform-specific
 * branches here.
 */
export function pickSeedForDate(dateString: string): string {
  if (ELIGIBLE_SEEDS.length === 0) return 'STARE';
  return ELIGIBLE_SEEDS[hashString(dateString) % ELIGIBLE_SEEDS.length];
}

/**
 * Convenience wrapper: today's shared daily seed.
 */
export function todaySeed(): string {
  return pickSeedForDate(utcDateString());
}
