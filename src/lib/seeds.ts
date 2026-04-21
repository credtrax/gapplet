/**
 * Seed selection.
 *
 * Not every 5-letter word makes a good seed. QUICK, for example, has only a
 * handful of one-swap neighbors in English (QUACK, QUART, QUIRK) because
 * Q-U must stay together. A seed with 3 neighbors produces a frustrating
 * 30-second game.
 *
 * On first call to pickSeed(), we filter CANDIDATE_SEEDS to only keep seeds
 * with at least MIN_NEIGHBORS valid one-swap neighbors in our dictionary.
 * The filtered list is memoized.
 *
 * Lazy init (instead of module-load init) matters for Edge Functions: cold
 * starts don't pay for neighbor computation unless the function actually
 * picks a seed.
 */

import { findNeighbors } from './game';
import { isWord } from './dictionary';

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

let _eligible: readonly string[] | null = null;

/**
 * Compute (and cache) the list of candidate seeds that pass the
 * neighbor-count filter. Runs on first call, reused thereafter.
 */
function getEligibleSeeds(): readonly string[] {
  if (_eligible !== null) return _eligible;
  const scored: string[] = [];
  for (const seed of CANDIDATE_SEEDS) {
    if (seed.length !== 5) continue;
    if (!isWord(seed)) continue;
    const neighbors = findNeighbors(seed.split(''));
    if (neighbors.length >= MIN_NEIGHBORS) {
      scored.push(seed);
    }
  }
  _eligible = Array.from(new Set(scored));
  return _eligible;
}

/**
 * Pick a random eligible seed. Falls back to STARE if for some reason no
 * candidates qualified (e.g., empty dictionary during tests).
 *
 * For daily shared puzzles (task #4), a deterministic variant keyed on UTC
 * date will be added alongside this. Both will share getEligibleSeeds().
 */
export function pickSeed(): string {
  const seeds = getEligibleSeeds();
  if (seeds.length === 0) return 'STARE';
  return seeds[Math.floor(Math.random() * seeds.length)];
}
