import { useDrag, type DragSource } from '../lib/drag';

type VirtualKeyboardProps = {
  /**
   * Called when a letter key is tapped (the click fallback path). Receives
   * the uppercase letter. The drag path bypasses this — it goes straight to
   * the DragProvider's onDrop.
   */
  onLetterKey: (letter: string) => void;
  /** Tap fallback: ⌫ acts on the selected cell. */
  onBackspace: () => void;
  /** Tap fallback: Space acts on the selected cell. */
  onSpace: () => void;
  /**
   * Called when "Restart Chain" is tapped. Returns the board to the seed
   * and resets the chain multiplier.
   */
  onRestartChain: () => void;
  /** Called when the "Buy Guess" key is tapped. Same as the hint system. */
  onBuyHint: () => void;
  letterKeyDisabled: boolean;
  backspaceDisabled: boolean;
  spaceDisabled: boolean;
  restartChainDisabled: boolean;
  hintDisabled: boolean;
  /**
   * Label for the Buy Guess button. Includes a live mm:ss countdown when
   * the minute-1 hint has been used and minute-2 hasn't unlocked yet.
   */
  hintLabel: string;
};

const ROW1 = 'QWERTYUIOP'.split('');
const ROW2 = 'ASDFGHJKL'.split('');
const ROW3_LETTERS = 'ZXCVBNM'.split('');

const LETTER_KEY_STYLE: React.CSSProperties = {
  flex: 1,
  minWidth: '28px',
  minHeight: '52px',
  padding: 0,
  background: 'rgba(0, 0, 0, 0.08)',
  border: 0,
  borderRadius: '5px',
  fontSize: '16px',
  fontWeight: 500,
  color: 'var(--gapplet-fg)',
  cursor: 'grab',
  // touchAction: 'none' lets pointer-drag work on touch without the browser
  // treating it as a scroll gesture. Critical for mobile drag.
  touchAction: 'none',
  userSelect: 'none',
};

const ACTION_KEY_STYLE: React.CSSProperties = {
  ...LETTER_KEY_STYLE,
  flex: 1.5,
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontWeight: 600,
};

const BACKSPACE_KEY_STYLE: React.CSSProperties = {
  ...ACTION_KEY_STYLE,
  fontSize: '22px',
  fontWeight: 400,
  letterSpacing: 'normal',
  textTransform: 'none',
};

const SPACE_KEY_STYLE: React.CSSProperties = {
  ...LETTER_KEY_STYLE,
  flex: 1,
  fontSize: '13px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 600,
};

// Top-row actions don't drag — they act on game state, not on a cell.
const TOP_ACTION_KEY_STYLE: React.CSSProperties = {
  ...LETTER_KEY_STYLE,
  flex: 1,
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 600,
  minHeight: '42px',
  cursor: 'pointer',
  touchAction: 'manipulation',
};

/**
 * Mobile-first on-screen keyboard, drag-input variant.
 *
 * Layout (top to bottom):
 *   [Restart Chain] [Buy Guess]                   row 0: two top actions
 *   Q W E R T Y U I O P                           row 1
 *   A S D F G H J K L                             row 2 (slight inset)
 *   Z X C V B N M [⌫]                             row 3
 *   [               Space               ]         row 4 (full width)
 *
 * Letter / Space / Backspace tiles are draggable: pointerdown anywhere on
 * the tile starts a drag, and dropping on a board cell commits the move.
 * A tap (release without crossing the drag threshold) falls through to
 * the click handler — same effect, but only works after a cell is
 * selected. Restart Chain and Buy Guess are click-only; they don't act
 * on a target cell.
 *
 * Enter and Revert keys removed in the drag-input experiment: there's no
 * dirty intermediate state to confirm or revert. Hardware keyboard input
 * is also disabled.
 */
export function VirtualKeyboard({
  onLetterKey,
  onBackspace,
  onSpace,
  onRestartChain,
  onBuyHint,
  letterKeyDisabled,
  backspaceDisabled,
  spaceDisabled,
  restartChainDisabled,
  hintDisabled,
  hintLabel,
}: VirtualKeyboardProps) {
  const { startDrag } = useDrag();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        margin: '0.75rem auto 0',
        maxWidth: '520px',
        width: '100%',
      }}
      role="group"
      aria-label="On-screen keyboard"
    >
      <div style={{ display: 'flex', gap: '5px' }}>
        <button
          onClick={onRestartChain}
          disabled={restartChainDisabled}
          style={TOP_ACTION_KEY_STYLE}
          aria-label="Restart chain — back to the seed word, chain resets"
          title="Return to the seed word. Chain resets to ×1.0. Previous path stays blocked. Disabled in hard mode."
        >
          Restart Chain
        </button>
        <button
          onClick={onBuyHint}
          disabled={hintDisabled}
          style={TOP_ACTION_KEY_STYLE}
          aria-label={`Buy Guess — ${hintLabel}`}
          title="Buy a hint. One per minute of play, no stacking. Chain does not advance on hinted moves; cost equals the placed letter's value."
        >
          {hintLabel}
        </button>
      </div>
      <div style={{ display: 'flex', gap: '5px' }}>
        {ROW1.map((l) => (
          <DraggableLetterKey
            key={l}
            letter={l}
            disabled={letterKeyDisabled}
            onTap={() => onLetterKey(l)}
            startDrag={startDrag}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '5px', padding: '0 5%' }}>
        {ROW2.map((l) => (
          <DraggableLetterKey
            key={l}
            letter={l}
            disabled={letterKeyDisabled}
            onTap={() => onLetterKey(l)}
            startDrag={startDrag}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '5px' }}>
        {ROW3_LETTERS.map((l) => (
          <DraggableLetterKey
            key={l}
            letter={l}
            disabled={letterKeyDisabled}
            onTap={() => onLetterKey(l)}
            startDrag={startDrag}
          />
        ))}
        <button
          onPointerDown={(e) => !backspaceDisabled && startDrag({ kind: 'backspace' }, e)}
          onClick={onBackspace}
          disabled={backspaceDisabled}
          style={BACKSPACE_KEY_STYLE}
          aria-label="Remove letter (drag onto a cell, or tap with a cell selected)"
        >
          ⌫
        </button>
      </div>
      <div style={{ display: 'flex', gap: '5px' }}>
        <button
          onPointerDown={(e) => !spaceDisabled && startDrag({ kind: 'space' }, e)}
          onClick={onSpace}
          disabled={spaceDisabled}
          style={SPACE_KEY_STYLE}
          aria-label="Insert space (drag onto a cell, or tap with a cell selected)"
        >
          Space
        </button>
      </div>
    </div>
  );
}

function DraggableLetterKey({
  letter,
  disabled,
  onTap,
  startDrag,
}: {
  letter: string;
  disabled: boolean;
  onTap: () => void;
  startDrag: (source: DragSource, e: React.PointerEvent) => void;
}) {
  return (
    <button
      onPointerDown={(e) => !disabled && startDrag({ kind: 'letter', letter }, e)}
      onClick={onTap}
      disabled={disabled}
      style={LETTER_KEY_STYLE}
      aria-label={`Letter ${letter}`}
    >
      {letter}
    </button>
  );
}
