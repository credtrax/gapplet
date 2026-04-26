/**
 * Blocklisted words — ones that, if attempted, trigger the soap penalty.
 *
 * Subset of `scripts/blocklist.txt` (LDNOOBW English) filtered to 1–5
 * letter single words, all-letters-only. Stored as a .ts module (rather
 * than .txt + Vite ?raw) so the same file can be imported natively by
 * both the browser build AND by Supabase Edge Functions running under
 * Deno — same isomorphic-friendly pattern as wordList.ts.
 *
 * Note that words listed here are ALSO already excluded from the
 * dictionary (`wordList.ts`) at build time. The two filters serve
 * different purposes:
 *   - wordList exclusion: makes the word un-PLAYABLE (validateBoard
 *     rejects it as "not in dictionary").
 *   - this set:           makes an attempt DETECTABLE so the client
 *     can apply the soap penalty instead of a generic chain-break.
 *
 * Regenerate manually from scripts/blocklist.txt if it changes; the
 * filter is `awk 'NF>0 && !/[^a-z]/' blocklist.txt | awk 'length>=1
 * && length<=5' | tr a-z A-Z | sort -u`.
 */

export const BLOCKLIST: ReadonlySet<string> = new Set<string>([
  'ANAL', 'ANUS', 'ASS', 'BBW', 'BDSM', 'BITCH', 'BONER', 'BOOB',
  'BOOBS', 'BUSTY', 'BUTT', 'CLIT', 'COCK', 'COCKS', 'COON', 'COONS',
  'CUM', 'CUNT', 'DICK', 'DILDO', 'DVDA', 'ECCHI', 'FAG', 'FECAL',
  'FELCH', 'FUCK', 'GROPE', 'GURO', 'HORNY', 'JIZZ', 'JUGGS', 'KIKE',
  'KINKY', 'MILF', 'MONG', 'NEGRO', 'NIGGA', 'NSFW', 'NUDE', 'ORGY',
  'PAKI', 'PANTY', 'PENIS', 'PIKEY', 'POOF', 'POON', 'PORN', 'PORNO',
  'PTHC', 'PUBES', 'PUSSY', 'QUEAF', 'QUEEF', 'QUIM', 'RAPE', 'SCAT',
  'SEMEN', 'SEX', 'SEXO', 'SEXY', 'SHIT', 'SHOTA', 'SKEET', 'SLUT',
  'SMUT', 'SPIC', 'SPUNK', 'SUCK', 'SUCKS', 'TIT', 'TITS', 'TITTY',
  'TUSHY', 'TWAT', 'TWINK', 'VULVA', 'WANK', 'WHORE', 'XX', 'XXX',
  'YAOI', 'YIFFY',
]);
