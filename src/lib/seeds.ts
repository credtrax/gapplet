/**
 * Seed selection.
 *
 * Not every 5-letter word makes a good seed. QUICK, for example, has only a
 * handful of one-swap neighbors in English (QUACK, QUART, QUIRK) because
 * Q-U must stay together. A seed with 3 neighbors produces a frustrating
 * 30-second game.
 *
 * At module init, we filter CANDIDATE_SEEDS to only keep seeds with at
 * least MIN_NEIGHBORS valid one-swap neighbors in our dictionary. The
 * result is ELIGIBLE_SEEDS.
 */

import { findNeighbors } from './game';
import { DICT } from './dictionary';

const MIN_NEIGHBORS = 10;

/**
 * Hand-curated list of candidate seeds. These are words that are:
 * - Common enough that players recognize them
 * - Mostly built from frequent letters (vowels, common consonants)
 * - Not too penalized by the dictionary (avoiding plural-heavy families
 *   that might exist in some dictionaries but not ours)
 *
 * The list is intentionally broader than we need; the filter will prune
 * any that don't meet MIN_NEIGHBORS.
 */
const CANDIDATE_SEEDS: string[] = [
  'STONE', 'CRATE', 'SLATE', 'HEART', 'TRAIN', 'HOUSE', 'POUND', 'PLANT',
  'GRACE', 'STARE', 'BEACH', 'DRINK', 'MOUSE', 'BRAIN', 'POINT', 'WATER',
  'LIGHT', 'FIGHT', 'SCORE', 'FRAME', 'PRIDE', 'BREAD', 'GREEN', 'SMART',
  'SPARK', 'BLOOM', 'SHINE', 'SHARE', 'SHORE', 'SPORT', 'SPARE', 'SPEAR',
  'PEARL', 'TEARS', 'STORE', 'STORY', 'STAND', 'STAIR', 'STAMP', 'TRACE',
  'BRACE', 'BRAKE', 'BRAVE', 'BLAME', 'BLADE', 'BLEND', 'BLAST', 'CLAIM',
  'CLEAR', 'CLASS', 'CLOSE', 'CLOTH', 'CLOUD', 'CRASH', 'CREAM', 'CROWN',
  'DREAM', 'DRILL', 'DRESS', 'DRAIN', 'FLAME', 'FLARE', 'FLASH', 'FRANK',
  'FRAUD', 'FRESH', 'FROST', 'FRUIT', 'GLARE', 'GLASS', 'GRAIN', 'GRAND',
  'GRANT', 'GRAVE', 'GRIND', 'LEAST', 'LEARN', 'LEASE', 'LEAVE', 'MATCH',
  'MAYBE', 'MERRY', 'MOIST', 'MONEY', 'MOUNT', 'MUSIC', 'NORTH', 'NURSE',
  'PAINT', 'PAUSE', 'PEACE', 'PEACH', 'PENNY', 'PHASE', 'PIANO', 'PLACE',
  'PLAIN', 'PRIZE', 'PROVE', 'RAISE', 'RAPID', 'READY', 'REACH', 'REACT',
  'ROUND', 'ROUTE', 'SCALE', 'SCARE', 'SENSE', 'SHAKE', 'SHAPE', 'SHARK',
  'SHARP', 'SHEEP', 'SHEET', 'SHIFT', 'SHIRT', 'SHOCK', 'SHOOT', 'SHORT',
  'SHOWN', 'SLICE', 'SMILE', 'SOLID', 'SPELL', 'SPICE', 'SPINE', 'SPLIT',
  'SPOIL', 'STAGE', 'STAFF', 'STAKE', 'STALE', 'START', 'STEAM', 'STEEL',
  'STEEP', 'STERN', 'STILL', 'STING', 'STINK', 'STOCK', 'STOOD', 'STOOL',
  'STORM', 'STOUT', 'STYLE', 'SWEAR', 'SWEAT', 'SWEEP', 'SWEET', 'SWELL',
  'SWIFT', 'SWORD', 'TASTE', 'TEACH', 'TOUCH', 'TOUGH', 'TRACK', 'TRADE',
  'TRAIL', 'TREAT', 'TRIAL', 'TRICK', 'TRIED', 'TRULY', 'TWICE', 'UNDER',
  'UNTIL', 'UPPER', 'USUAL', 'VAGUE', 'VALID', 'VALUE', 'VAULT', 'VOICE',
  'WASTE', 'WHEAT', 'WHEEL', 'WHERE', 'WHICH', 'WHILE', 'WHITE', 'WHOLE',
  'WOMAN', 'WORLD', 'WORRY', 'WORSE', 'WORST', 'WORTH', 'WOULD', 'WOUND',
  'WRITE', 'WRONG', 'WROTE',
];

/**
 * Seeds that pass the neighbor-count filter. Computed once at module load.
 *
 * If the dictionary is swapped for a larger one, many more candidates will
 * qualify and this list grows automatically. No manual re-curation needed.
 */
export const ELIGIBLE_SEEDS: readonly string[] = (() => {
  const scored: string[] = [];
  for (const seed of CANDIDATE_SEEDS) {
    if (seed.length !== 5) continue;
    if (!DICT.has(seed)) continue;
    const neighbors = findNeighbors(seed.split(''));
    if (neighbors.length >= MIN_NEIGHBORS) {
      scored.push(seed);
    }
  }
  // Dedupe — in case the candidate list has duplicates.
  return Array.from(new Set(scored));
})();

/**
 * Pick a random eligible seed. Falls back to STARE if for some reason no
 * candidates qualified (e.g., empty dictionary during tests).
 *
 * For daily puzzles, replace this with a deterministic function keyed on
 * UTC date. See ROADMAP.md.
 */
export function pickSeed(): string {
  if (ELIGIBLE_SEEDS.length === 0) return 'STARE';
  return ELIGIBLE_SEEDS[Math.floor(Math.random() * ELIGIBLE_SEEDS.length)];
}
