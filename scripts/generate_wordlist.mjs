#!/usr/bin/env node
/**
 * Generate src/lib/wordList.ts — Gapplet's game dictionary.
 *
 * Reads:
 *   - ENABLE word list (fetched from dolph/dictionary if not cached at
 *     /tmp/enable.txt)
 *   - scripts/blocklist.txt (LDNOOBW English list, committed to the repo)
 *
 * Filters ENABLE down to:
 *   - Words of length 1–5 (the board can't hold longer)
 *   - Uppercase alpha only (no hyphens, apostrophes, numbers)
 *   - Not present in the blocklist (obscenity / slur filter — task #21)
 *
 * Writes src/lib/wordList.ts with the result bundled as a `WORDS_TEXT`
 * string export. The isomorphic dictionary module (src/lib/dictionary.ts)
 * parses it into a Set on first lookup.
 *
 * After running this, run `node scripts/generate_seeds.mjs` to rebuild
 * the daily-seed pool against the filtered dictionary.
 *
 * Usage:  node scripts/generate_wordlist.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_PATH = path.join(REPO_ROOT, 'src/lib/wordList.ts');
const BLOCKLIST_PATH = path.join(REPO_ROOT, 'scripts/blocklist.txt');
const ENABLE_PATH = '/tmp/enable.txt';
const ENABLE_URL = 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt';

// --- Fetch ENABLE if not cached ---------------------------------------------

if (!fs.existsSync(ENABLE_PATH)) {
  console.log(`Fetching ENABLE from ${ENABLE_URL}`);
  execSync(`curl -sSfL -o "${ENABLE_PATH}" "${ENABLE_URL}"`);
}

// --- Load inputs ------------------------------------------------------------

const rawEnable = fs.readFileSync(ENABLE_PATH, 'utf8');
const enableAll = rawEnable
  .split(/\s+/)
  .map((w) => w.trim().toUpperCase())
  .filter((w) => /^[A-Z]+$/.test(w));
console.log(`ENABLE total: ${enableAll.length} entries`);

const blocklist = new Set(
  fs
    .readFileSync(BLOCKLIST_PATH, 'utf8')
    .split('\n')
    .map((l) => l.trim().toUpperCase())
    .filter((l) => l && /^[A-Z]+$/.test(l))
);
console.log(`Blocklist single-word entries: ${blocklist.size}`);

// --- Filter -----------------------------------------------------------------

const fiveAndUnder = enableAll.filter((w) => w.length >= 1 && w.length <= 5);
console.log(`After 1–5 letter filter: ${fiveAndUnder.length}`);

const removed = fiveAndUnder.filter((w) => blocklist.has(w));
const kept = fiveAndUnder.filter((w) => !blocklist.has(w));
const deduped = [...new Set(kept)].sort();
console.log(`Removed by blocklist: ${removed.length}`);
if (removed.length) {
  console.log(`  Removed words: ${[...new Set(removed)].sort().join(', ')}`);
}
console.log(`Final word count: ${deduped.length}`);

// --- Write wordList.ts ------------------------------------------------------

const body = deduped.join('\n');
const output = `/**
 * The Gapplet dictionary, embedded as a plain string.
 *
 * Stored as a .ts module (rather than .txt + Vite ?raw) so the same file
 * can be imported natively by both the browser build AND by Supabase Edge
 * Functions running under Deno. One source of truth, no platform-specific
 * import gymnastics.
 *
 * Regenerate via \`node scripts/generate_wordlist.mjs\`. The generator:
 *   - Pulls ENABLE from dolph/dictionary
 *   - Filters to 1–5 letter words
 *   - Applies scripts/blocklist.txt (LDNOOBW English) to remove slurs
 *     and obscene terms
 * Regenerated on ${new Date().toISOString().slice(0, 10)}. ${deduped.length} entries.
 *
 * DO NOT hand-edit this file. Any manual change will be clobbered on the
 * next regeneration. If you need to allow a specific blocked word back
 * in, edit scripts/blocklist.txt (remove the line for that word) and
 * rerun the generator.
 */
export const WORDS_TEXT = \`
${body}
\`;
`;

fs.writeFileSync(OUT_PATH, output);
console.log(`Wrote ${path.relative(REPO_ROOT, OUT_PATH)} (${output.length} bytes)`);
console.log();
console.log('Next: run `node scripts/generate_seeds.mjs` to rebuild the seed pool.');
