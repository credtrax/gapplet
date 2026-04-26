import { LETTER_VALUES, SPACE } from '../lib/letterValues';
import { useDrag, DROP_TARGET_ATTR } from '../lib/drag';

type BoardProps = {
  /** Current 5-cell board state (always the last committed state in drag-input mode). */
  board: readonly string[];
  /** Which cell is currently selected (null if none). Used by tap-fallback to know where letters go. */
  selectedIdx: number | null;
  /** True before the player's first interaction — styled as "ready" */
  idle: boolean;
  /** Called when a cell is clicked (tap path; drag path is handled separately). */
  onCellClick: (idx: number) => void;
};

/**
 * The 5-cell board.
 *
 * Each cell is both a drop target (data-drop-target-idx={i}, picked up by
 * the drag system via elementFromPoint) and a drag source (pointerdown
 * on a letter cell starts a board-cell drag for the swap mechanic).
 * Empty cells aren't drag sources — there's nothing to pick up.
 *
 * Cell border states, priority high-to-low:
 *   - drag-target:   green ring (a drag is active and this is the
 *                    cell under the pointer).
 *   - drag-source:   the source cell of the active drag goes
 *                    semi-transparent so the user sees the letter
 *                    "lifting off" into the ghost.
 *   - selected:      blue (player tapped this cell — tap-fallback path).
 *   - idle:          dashed (game is ready but clock hasn't started).
 *   - normal:        thin gray.
 */
export function Board({ board, selectedIdx, idle, onCellClick }: BoardProps) {
  const { state: dragState, startDrag } = useDrag();

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
        const isDragTarget = dragState.active != null && dragState.hoverTargetIdx === i;
        const isDragSource =
          dragState.active?.kind === 'board-cell' && dragState.active.idx === i;

        const classes = ['gapplet-tile'];
        if (isSpace) classes.push('gapplet-tile--empty');

        let stateAttr: string | undefined;
        if (isDragTarget) stateAttr = 'drag-target';
        else if (isSelected) stateAttr = 'selected';
        else if (idle) stateAttr = 'idle';

        // pointerdown on a letter cell starts a board-cell drag (the swap
        // mechanic). Empty cells skip this — there's nothing to lift off.
        const onPointerDown = (e: React.PointerEvent) => {
          if (isSpace) return;
          startDrag({ kind: 'board-cell', idx: i, letter: ch }, e);
        };

        return (
          <button
            key={i}
            role="gridcell"
            aria-label={isSpace ? `Cell ${i + 1}, empty` : `Cell ${i + 1}, letter ${ch}`}
            aria-selected={isSelected}
            onClick={() => onCellClick(i)}
            onPointerDown={onPointerDown}
            className={classes.join(' ')}
            data-state={stateAttr}
            {...{ [DROP_TARGET_ATTR]: i }}
            style={{
              height: '110px',
              borderRadius: '8px',
              fontSize: '42px',
              fontWeight: 700,
              fontFamily: 'Georgia, "Times New Roman", serif',
              position: 'relative',
              cursor: isSpace ? 'pointer' : 'grab',
              userSelect: 'none',
              padding: 0,
              touchAction: 'none',
              opacity: isDragSource ? 0.3 : 1,
              transition: 'opacity 0.1s ease-out',
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
