/**
 * Standard Scrabble letter values.
 *
 * These are used intentionally because most players already understand
 * Scrabble scoring — Q and Z are 10, common vowels are 1, etc. Introducing
 * a custom scoring system would add friction without adding meaning.
 */
export const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
  J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1,
  S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

/**
 * The space/gap character. Stored in the board array as a literal space,
 * but this constant makes the intent explicit at call sites.
 */
export const SPACE = ' ';

/**
 * Sum Scrabble values over a board. Spaces contribute 0.
 */
export function boardPoints(board: readonly string[]): number {
  let sum = 0;
  for (const c of board) {
    if (c === SPACE) continue;
    sum += LETTER_VALUES[c] ?? 0;
  }
  return sum;
}
