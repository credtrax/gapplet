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

        // Priority order: hinted > dirty > selected > idle > (none).
        // Dirty uses the pulse class; others use data-state for a
        // static ring. Empty cells use the recessed variant.
        const classes = ['gapplet-tile'];
        if (isSpace) classes.push('gapplet-tile--empty');
        if (isDirty) classes.push('gapplet-dirty-cell');

        let stateAttr: string | undefined;
        if (isHinted) stateAttr = 'hinted';
        else if (isDirty) stateAttr = undefined; // pulse class handles ring
        else if (isSelected) stateAttr = 'selected';
        else if (idle) stateAttr = 'idle';

        return (
          <button
            key={i}
            role="gridcell"
            aria-label={isSpace ? `Cell ${i + 1}, empty` : `Cell ${i + 1}, letter ${ch}`}
            aria-selected={isSelected}
            onClick={() => onCellClick(i)}
            className={classes.join(' ')}
            data-state={stateAttr}
            style={{
              height: '110px',
              borderRadius: '8px',
              fontSize: '42px',
              fontWeight: 700,
              fontFamily: 'Georgia, "Times New Roman", serif',
              position: 'relative',
              cursor: 'pointer',
              userSelect: 'none',
              padding: 0,
            }}
          >
            {isSpace ? (
              <span style={{ fontSize: '30px', color: 'var(--gapplet-muted)', fontFamily: 'inherit' }}>␣</span>
            ) : (
              <>
                <span>{ch}</span>
                <span
                  style={{
                    position: 'absolute',
                    bottom: '5px',
                    right: '7px',
                    fontSize: '13px',
                    color: 'var(--gapplet-tile-fg)',
                    fontWeight: 600,
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    opacity: 0.7,
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
