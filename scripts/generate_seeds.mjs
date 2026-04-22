#!/usr/bin/env node
/**
 * Generate src/lib/eligibleSeeds.ts — Gapplet's pre-baked daily-puzzle seed pool.
 *
 * Reads:
 *   - src/lib/wordList.ts  (ENABLE 1–5 letter words bundled as WORDS_TEXT)
 *   - popular.txt          (curated common-words subset from dolph/dictionary);
 *                          fetched on-demand if not already at /tmp/popular.txt
 *
 * Filters seeds down to 5-letter words that satisfy all three:
 *   - Present in ENABLE (so gameplay validates them)
 *   - Present in popular.txt (so the player recognizes the word)
 *   - Have at least MIN_NEIGHBORS (=8) valid one-swap neighbors in ENABLE
 *
 * Writes src/lib/eligibleSeeds.ts with a sorted, de-duplicated array. The
 * runtime picker (pickSeed, pickSeedForDate) just reads this array — no
 * neighbor-scanning at boot, which matters for Edge Function cold starts.
 *
 * Regenerate whenever the dictionary changes. See docs/DICTIONARY.md.
 *
 * Usage:  node scripts/generate_seeds.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WORD_LIST_PATH = path.join(REPO_ROOT, 'src/lib/wordList.ts');
const OUT_PATH = path.join(REPO_ROOT, 'src/lib/eligibleSeeds.ts');
const POPULAR_PATH = '/tmp/popular.txt';
const POPULAR_URL = 'https://raw.githubusercontent.com/dolph/dictionary/master/popular.txt';

const MIN_NEIGHBORS = 8;
const SPACE = ' ';

// --- Load ENABLE dictionary from the bundled wordList.ts ---------------------

const wordListSrc = fs.readFileSync(WORD_LIST_PATH, 'utf8');
const m = wordListSrc.match(/export const WORDS_TEXT = `([^`]*)`/s);
if (!m) {
  console.error(`Could not find WORDS_TEXT in ${WORD_LIST_PATH}`);
  process.exit(1);
}
const dictWords = m[1]
  .split(/\s+/)
  .map((w) => w.trim().toUpperCase())
  .filter((w) => /^[A-Z]+$/.test(w));
const DICT = new Set(dictWords);
console.log(`Loaded ${DICT.size} ENABLE words from ${path.relative(REPO_ROOT, WORD_LIST_PATH)}`);

// --- Ensure popular.txt is present -------------------------------------------

if (!fs.existsSync(POPULAR_PATH)) {
  console.log(`Fetching popular.txt from ${POPULAR_URL}`);
  execSync(`curl -sSfL -o "${POPULAR_PATH}" "${POPULAR_URL}"`);
}
const POPULAR = new Set(
  fs
    .readFileSync(POPULAR_PATH, 'utf8')
    .split(/\s+/)
    .map((w) => w.trim().toUpperCase())
    .filter((w) => /^[A-Z]+$/.test(w))
);
console.log(`Loaded ${POPULAR.size} words from popular.txt`);

// --- Game logic (mirror of src/lib/game.ts, standalone for this script) ------

function isWord(word) {
  if (word.length === 1) return word === 'A' || word === 'I';
  return DICT.has(word);
}

function validateBoard(board) {
  const spaceCount = board.filter((c) => c === SPACE).length;
  if (spaceCount === 0) return isWord(board.join(''));
  if (spaceCount === 1) {
    const parts = board.join('').split(SPACE).filter((p) => p.length > 0);
    return parts.every(isWord);
  }
  return false;
}

function boardKey(board) {
  return board.join('|');
}

function countNeighbors(board) {
  const seen = new Set([boardKey(board)]);
  let count = 0;
  for (let i = 0; i < 5; i++) {
    const orig = board[i];
    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c);
      if (letter === orig) continue;
      const nb = board.slice();
      nb[i] = letter;
      const k = boardKey(nb);
      if (seen.has(k)) continue;
      if (validateBoard(nb)) {
        count++;
        seen.add(k);
      }
    }
    if (orig !== SPACE) {
      const nb = board.slice();
      nb[i] = SPACE;
      const k = boardKey(nb);
      if (!seen.has(k) && validateBoard(nb)) {
        count++;
        seen.add(k);
      }
    }
  }
  return count;
}

// --- Filter and write --------------------------------------------------------

const fiveLetterPopular = dictWords.filter((w) => w.length === 5 && POPULAR.has(w));
console.log(`5-letter candidates (ENABLE ∩ popular.txt): ${fiveLetterPopular.length}`);

const t0 = Date.now();
const eligible = fiveLetterPopular
  .filter((w) => countNeighbors(w.split('')) >= MIN_NEIGHBORS)
  .sort();
console.log(
  `Computed neighbor counts in ${Date.now() - t0}ms. ` +
    `Eligible (≥${MIN_NEIGHBORS} neighbors): ${eligible.length}`
);

const body = eligible.map((w) => `  '${w}',`).join('\n');
const output = `/**
 * Pre-baked Gapplet seed pool. DO NOT EDIT MANUALLY — regenerate via
 * \`node scripts/generate_seeds.mjs\` whenever wordList.ts changes.
 *
 * Source: ENABLE 5-letter words ∩ popular.txt (dolph/dictionary), filtered
 * to entries with ≥${MIN_NEIGHBORS} valid one-swap neighbors. See docs/DICTIONARY.md.
 *
 * ${eligible.length} seeds, generated ${new Date().toISOString().slice(0, 10)}.
 */
export const ELIGIBLE_SEEDS: readonly string[] = [
${body}
];
`;

fs.writeFileSync(OUT_PATH, output);
console.log(`Wrote ${path.relative(REPO_ROOT, OUT_PATH)} (${output.length} bytes)`);
