import { LETTER_VALUES, SPACE } from '../lib/letterValues';

type BoardProps = {
  /** Current 5-cell board state */
  board: readonly string[];
  /** Last successfully-submitted board; used to detect uncommitted edits */
  lastCommittedBoard: readonly string[];
  /** Which cell is currently selected (null if none) */
  selectedIdx: number | null;
  /** If a hint is pending, this is the cell that was auto-filled */
  hintedIdx: number | null;
  /** True before the player's first interaction — styled as "ready" */
  idle: boolean;
  /** Called when a cell is clicked */
  onCellClick: (idx: number) => void;
};

/**
 * The 5-cell board. Stateless — all visual state comes from props.
 *
 * Each cell shows the letter (or a space glyph if empty) and the Scrabble
 * value in the bottom-right corner. The border + glow style encode five states,
 * priority high-to-low:
 *   - hinted:   amber (the "Buy a guess" suggestion) — takes precedence even
 *               though hinted cells are technically also dirty.
 *   - dirty:    yellow + pulsing glow (change proposed, awaiting Enter).
 *   - selected: blue (player clicked this cell, not yet changed).
 *   - idle:     dashed (game is ready but clock hasn't started).
 *   - normal:   thin gray.
 */
export function Board({
  board,
  lastCommittedBoard,
  selectedIdx,
  hintedIdx,
  idle,
  onCellClick,
}: BoardProps) {
  return (
    <div
      className="grid grid-cols-5 gap-2.5 my-5"
      style={{ height: '110px' }}
      role="grid"
      aria-label="Gapplet board"
    >
      {board.map((ch, i) => {
        const isSpace = ch === SPACE;
        const isSelected = i === selectedIdx;
        const isHinted = i === hintedIdx;
        const isDirty = !isHinted && board[i] !== lastCommittedBoard[i];

        let border = '0.5px solid var(--gapplet-border)';
        if (isHinted) {
          border = '2px solid var(--gapplet-hint)';
        } else if (isDirty) {
          border = '2px solid var(--gapplet-dirty)';
        } else if (isSelected) {
          border = '2px solid var(--gapplet-accent)';
        } else if (idle) {
          border = '1px dashed var(--gapplet-border)';
        }

        return (
          <button
            key={i}
            role="gridcell"
            aria-label={isSpace ? `Cell ${i + 1}, empty` : `Cell ${i + 1}, letter ${ch}`}
            aria-selected={isSelected}
            onClick={() => onCellClick(i)}
            className={isDirty ? 'gapplet-dirty-cell' : undefined}
            style={{
              height: '110px',
              border,
              borderRadius: '6px',
              background: isSpace ? 'var(--gapplet-cell-empty)' : 'var(--gapplet-cell-bg)',
              fontSize: '40px',
              fontWeight: 500,
              position: 'relative',
              cursor: 'pointer',
              userSelect: 'none',
              padding: 0,
            }}
          >
            {isSpace ? (
              <span style={{ fontSize: '28px', color: 'var(--gapplet-muted)' }}>␣</span>
            ) : (
              <>
                <span>{ch}</span>
                <span
                  style={{
                    position: 'absolute',
                    bottom: '4px',
                    right: '6px',
                    fontSize: '11px',
                    color: 'var(--gapplet-muted)',
                    fontWeight: 400,
                  }}
                >
                  {LETTER_VALUES[ch] ?? 0}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
