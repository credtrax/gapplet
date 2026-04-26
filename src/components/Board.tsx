import { LETTER_VALUES, SPACE } from '../lib/letterValues';
import { useDrag, DROP_TARGET_ATTR, DROP_GAP_ATTR } from '../lib/drag';

type BoardProps = {
  /** Current 5-cell board state (always the last committed state in drag-input mode). */
  board: readonly string[];
  /** Which cell is currently selected (null if none). Used by tap-fallback. */
  selectedIdx: number | null;
  /** True before the player's first interaction — styled as "ready" */
  idle: boolean;
  /** Called when a cell is clicked (tap path; drag path is handled separately). */
  onCellClick: (idx: number) => void;
};

/**
 * The 5-cell board, with explicit gap drop zones between cells.
 *
 * Each cell is a drop target (data-drop-target-idx={i}, replace
 * semantics) and a drag source (board-cell drag for the swap mechanic).
 * Empty cells aren't drag sources.
 *
 * Each interior gap (1..4) is a drop target with insert-with-shift
 * semantics, but ONLY visible/usable when the board has a space AND a
 * letter is being dragged. The gap zone DOM stays present always so
 * pointer detection is consistent; what changes is the visual
 * indicator and whether the drop has anywhere to shift to (handled in
 * App.handleDrop — bails if no space exists).
 *
 * Cell border states, priority high-to-low:
 *   - drag-target:   green ring (drag active, pointer over this cell).
 *   - drag-source:   the source cell of the active drag goes 30%
 *                    opacity so the user sees the letter "lifting off".
 *   - selected:      blue (player tapped this cell — tap-fallback path).
 *   - idle:          dashed (game is ready but clock hasn't started).
 *   - normal:        thin gray.
 */
export function Board({ board, selectedIdx, idle, onCellClick }: BoardProps) {
  const { state: dragState, startDrag } = useDrag();
  const hasSpace = board.some((c) => c === SPACE);
  const isLetterDrag = dragState.active?.kind === 'letter';
  const gapsVisible = hasSpace && isLetterDrag;

  return (
    <div
      style={{
        display: 'flex',
        height: '110px',
        margin: '1.25rem 0',
        alignItems: 'stretch',
      }}
      role="grid"
      aria-label="Joe's Word Nerd board"
    >
      {board.map((ch, i) => {
        const cell = renderCell({
          ch,
          i,
          isSelected: i === selectedIdx,
          isDragTarget:
            dragState.hoverTarget?.kind === 'cell' && dragState.hoverTarget.idx === i,
          isDragSource:
            dragState.active?.kind === 'board-cell' && dragState.active.idx === i,
          idle,
          onCellClick,
          startDrag,
        });
        // Insert a gap zone after every cell except the last.
        if (i === board.length - 1) return cell;
        const gapIdx = i + 1;
        const gap = (
          <GapZone
            key={`gap-${gapIdx}`}
            gapIdx={gapIdx}
            visible={gapsVisible}
            hovered={
              dragState.hoverTarget?.kind === 'gap' &&
              dragState.hoverTarget.idx === gapIdx
            }
          />
        );
        // Return the cell + the gap zone as siblings; React handles flat keys.
        return (
          <span
            key={`pair-${i}`}
            style={{ display: 'contents' }}
          >
            {cell}
            {gap}
          </span>
        );
      })}
    </div>
  );
}

type CellArgs = {
  ch: string;
  i: number;
  isSelected: boolean;
  isDragTarget: boolean;
  isDragSource: boolean;
  idle: boolean;
  onCellClick: (idx: number) => void;
  startDrag: (source: { kind: 'board-cell'; idx: number; letter: string }, e: React.PointerEvent) => void;
};

function renderCell({
  ch,
  i,
  isSelected,
  isDragTarget,
  isDragSource,
  idle,
  onCellClick,
  startDrag,
}: CellArgs) {
  const isSpace = ch === SPACE;

  const classes = ['gapplet-tile'];
  if (isSpace) classes.push('gapplet-tile--empty');

  let stateAttr: string | undefined;
  if (isDragTarget) stateAttr = 'drag-target';
  else if (isSelected) stateAttr = 'selected';
  else if (idle) stateAttr = 'idle';

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
        flex: 1,
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
}

/**
 * Drop zone between two cells. Always 10 px wide so the board layout
 * stays geometrically identical to the previous CSS-grid gap. The
 * vertical-line indicator only renders when `visible` is true (drag
 * active + space in play) — closed gaps are inert visually but still
 * detected by elementFromPoint, so accidental drops still register
 * (App.handleDrop bails when k < 0, i.e. no space to shift into).
 */
function GapZone({
  gapIdx,
  visible,
  hovered,
}: {
  gapIdx: number;
  visible: boolean;
  hovered: boolean;
}) {
  return (
    <div
      {...{ [DROP_GAP_ATTR]: gapIdx }}
      aria-hidden="true"
      style={{
        width: '10px',
        height: '110px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // touchAction prevents scroll-vs-drop conflicts on touch devices.
        touchAction: 'none',
      }}
    >
      {visible && (
        <div
          style={{
            width: '3px',
            height: hovered ? '85%' : '40%',
            background: hovered ? 'var(--gapplet-success)' : 'var(--gapplet-border)',
            borderRadius: '2px',
            opacity: hovered ? 1 : 0.55,
            boxShadow: hovered ? '0 0 12px 2px rgba(5, 150, 105, 0.55)' : 'none',
            transition: 'all 0.15s ease-out',
          }}
        />
      )}
    </div>
  );
}
