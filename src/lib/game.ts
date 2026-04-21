/**
 * Core game logic for Gapplet.
 *
 * These functions are PURE — they take inputs and return outputs with no
 * side effects, no React, no DOM. That makes them easy to test and easy
 * to reason about. Anything stateful (timer, selected cell, score) lives
 * in the React components.
 */

import { isWord } from './dictionary';
import { LETTER_VALUES, SPACE, boardPoints } from './letterValues';

/**
 * A board is always exactly 5 cells. Each cell holds a single uppercase
 * letter or a space. Represented as a string array so we can mutate by
 * index without string-splicing gymnastics.
 */
export type Board = string[];

/**
 * Result of validating a board configuration.
 */
export type ValidationResult =
  | { ok: true; words: string[] }
  | { ok: false; reason: string };

/**
 * A single legal neighbor of a board — what the board would look like if
 * exactly one cell were changed.
 */
export type Neighbor = {
  board: Board;
  words: string[];
  changedIdx: number;
  placedChar: string;
};

/**
 * A stable string key for a board state, used for repeat-detection.
 * The pipe separator prevents accidental collisions (e.g., board ['A', 'B']
 * and ['AB'] would otherwise both stringify to "AB").
 */
export function boardKey(board: readonly string[]): string {
  return board.join('|');
}

/**
 * Count how many cells differ between two boards.
 */
export function countDiffs(a: readonly string[], b: readonly string[]): number {
  let n = 0;
  for (let i = 0; i < 5; i++) {
    if (a[i] !== b[i]) n++;
  }
  return n;
}

/**
 * Validate a board configuration.
 *
 * Rules:
 * - 0 spaces: the 5 letters must form a single dictionary word
 * - 1 space: the letters on either side must each form valid words
 *   (single-letter words allowed only for A and I)
 * - 2+ spaces: invalid
 */
export function validateBoard(board: readonly string[]): ValidationResult {
  if (board.length !== 5) {
    return { ok: false, reason: 'board must have exactly 5 cells' };
  }

  const spaceCount = board.filter((c) => c === SPACE).length;

  if (spaceCount === 0) {
    const word = board.join('');
    if (isWord(word)) {
      return { ok: true, words: [word] };
    }
    return { ok: false, reason: `"${word}" isn't in the dictionary` };
  }

  if (spaceCount === 1) {
    const parts = board.join('').split(SPACE).filter((p) => p.length > 0);
    if (parts.length !== 2) {
      // This shouldn't happen if spaceCount is exactly 1, but guard anyway.
      return { ok: false, reason: 'space must split two words' };
    }
    for (const p of parts) {
      if (!isWord(p)) {
        return { ok: false, reason: `"${p}" isn't in the dictionary` };
      }
    }
    return { ok: true, words: parts };
  }

  return { ok: false, reason: 'too many spaces — only one allowed' };
}

/**
 * Find every valid one-swap neighbor of a given board.
 *
 * Used by the seed-filter (to drop dead-end seeds) and by the "Buy a guess"
 * hint system. A "neighbor" is a board differing from the input in exactly
 * one cell — either a letter swap, letter→space, or space→letter.
 */
export function findNeighbors(board: readonly string[]): Neighbor[] {
  const results: Neighbor[] = [];
  const originalKey = boardKey(board);
  const seenKeys = new Set<string>([originalKey]);

  for (let i = 0; i < 5; i++) {
    const orig = board[i];

    // Try each uppercase letter A-Z
    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c);
      if (letter === orig) continue;
      const newBoard = board.slice();
      newBoard[i] = letter;
      const k = boardKey(newBoard);
      if (seenKeys.has(k)) continue;
      const v = validateBoard(newBoard);
      if (v.ok) {
        results.push({
          board: newBoard,
          words: v.words,
          changedIdx: i,
          placedChar: letter,
        });
        seenKeys.add(k);
      }
    }

    // Also try replacing a letter with a space. (We don't try space→space;
    // that would be a no-op.)
    if (orig !== SPACE) {
      const newBoard = board.slice();
      newBoard[i] = SPACE;
      const k = boardKey(newBoard);
      if (!seenKeys.has(k)) {
        const v = validateBoard(newBoard);
        if (v.ok) {
          results.push({
            board: newBoard,
            words: v.words,
            changedIdx: i,
            placedChar: SPACE,
          });
          seenKeys.add(k);
        }
      }
    }
  }

  return results;
}

/**
 * Chain multiplier rules:
 * - Starts at 1.0 at the beginning of the game
 * - Advances by CHAIN_STEP (0.2) on each successful non-hint move
 * - Caps at CHAIN_CAP (5.0)
 * - Resets to 1.0 on invalid move, repeat state, or multi-cell change
 */
export const CHAIN_START = 1.0;
export const CHAIN_STEP = 0.2;
export const CHAIN_CAP = 5.0;

export function advanceChain(current: number): number {
  return Math.min(current + CHAIN_STEP, CHAIN_CAP);
}

/**
 * Score a normal (non-hinted) move.
 */
export function scoreMove(board: readonly string[], chainMultiplier: number): number {
  return Math.round(boardPoints(board) * chainMultiplier);
}

/**
 * Score a hinted move. The letter value of the placed character is
 * subtracted; spaces cost 0. Minimum score is 0 (never negative).
 */
export function scoreHintedMove(
  board: readonly string[],
  chainMultiplier: number,
  placedChar: string
): number {
  const placedVal = placedChar === SPACE ? 0 : (LETTER_VALUES[placedChar] ?? 0);
  const gross = Math.round(boardPoints(board) * chainMultiplier);
  return Math.max(0, gross - placedVal);
}
