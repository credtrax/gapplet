type VirtualKeyboardProps = {
  /** Called when a letter key is tapped. Receives the uppercase letter. */
  onLetterKey: (letter: string) => void;
  /** Called when Enter is tapped. Same semantics as physical Enter — submits. */
  onEnter: () => void;
  /**
   * Called when the ⌫ key is tapped. Gapplet's Remove semantics (shift
   * right-of-selection left), not Wordle's "delete last letter."
   */
  onBackspace: () => void;
  /** Called when the Space bar is tapped. Toggles selected cell to space. */
  onSpace: () => void;
  /**
   * Called when "Restart Chain" (left top) is tapped. Returns the board
   * to the seed and resets the chain multiplier. Button-only — no
   * physical keyboard shortcut, by design (bigger commitment).
   */
  onRestartChain: () => void;
  /**
   * Called when "Revert (Esc)" (right top) is tapped. Undoes any
   * uncommitted edits, putting the board back to the last committed
   * state. Chain unchanged. Mirrors physical Esc.
   */
  onRevert: () => void;
  /** Called when the "Buy Guess" key is tapped. Same as the hint system. */
  onBuyHint: () => void;
  /** Letter keys are disabled while no board cell is selected. */
  letterKeyDisabled: boolean;
  enterDisabled: boolean;
  backspaceDisabled: boolean;
  spaceDisabled: boolean;
  restartChainDisabled: boolean;
  revertDisabled: boolean;
  hintDisabled: boolean;
  /**
   * Label for the Buy Guess button. Includes a live mm:ss countdown when
   * the minute-1 hint has been used and minute-2 hasn't unlocked yet.
   * App owns the label since it depends on timeLeft + hintsByWindow.
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
  cursor: 'pointer',
  touchAction: 'manipulation',
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

const TOP_ACTION_KEY_STYLE: React.CSSProperties = {
  ...LETTER_KEY_STYLE,
  flex: 1,
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 600,
  minHeight: '42px',
};

/**
 * Mobile-first on-screen keyboard.
 *
 * Layout (top to bottom):
 *   [Revert (Esc)] [Restart Chain (1)] [Buy Guess (=)]   row 0: three top actions
 *   Q W E R T Y U I O P                                   row 1
 *   A S D F G H J K L                                     row 2 (slight inset)
 *   [Enter] Z X C V B N M [⌫]                             row 3
 *   [               Space               ]                 row 4 (full width)
 *
 * Top row actions (UX-ordered by reversibility):
 *   - Revert (Esc): undo uncommitted edits only (most reversible, leftmost).
 *   - Restart Chain (1): back to seed word, chain resets (bigger commitment).
 *   - Buy Guess (=): consume a hint (costs a letter value + freezes chain).
 *
 * Each has a physical-keyboard shortcut in parentheses. Mobile users tap
 * the button; desktop users can use the shortcut or the button.
 */
export function VirtualKeyboard({
  onLetterKey,
  onEnter,
  onBackspace,
  onSpace,
  onRestartChain,
  onRevert,
  onBuyHint,
  letterKeyDisabled,
  enterDisabled,
  backspaceDisabled,
  spaceDisabled,
  restartChainDisabled,
  revertDisabled,
  hintDisabled,
  hintLabel,
}: VirtualKeyboardProps) {
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
          onClick={onRevert}
          disabled={revertDisabled}
          style={TOP_ACTION_KEY_STYLE}
          aria-label="Revert to the last committed word (Esc key)"
          title="Undo any uncommitted edits and return to the last successfully-submitted word. Chain and score unchanged."
        >
          Revert (Esc)
        </button>
        <button
          onClick={onRestartChain}
          disabled={restartChainDisabled}
          style={TOP_ACTION_KEY_STYLE}
          aria-label="Restart chain — back to the seed word, chain resets (1 key)"
          title="Return to the seed word. Chain resets to ×1.0. Previous path stays blocked. Disabled in hard mode."
        >
          Restart Chain (1)
        </button>
        <button
          onClick={onBuyHint}
          disabled={hintDisabled}
          style={TOP_ACTION_KEY_STYLE}
          aria-label={`Buy Guess — ${hintLabel} (= key)`}
          title="Buy a hint. One per minute of play, no stacking. Chain does not advance on hinted moves; cost equals the placed letter's value."
        >
          {hintLabel}
        </button>
      </div>
      <div style={{ display: 'flex', gap: '5px' }}>
        {ROW1.map((l) => (
          <LetterKey key={l} letter={l} onClick={() => onLetterKey(l)} disabled={letterKeyDisabled} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '5px', padding: '0 5%' }}>
        {ROW2.map((l) => (
          <LetterKey key={l} letter={l} onClick={() => onLetterKey(l)} disabled={letterKeyDisabled} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '5px' }}>
        <button
          onClick={onEnter}
          disabled={enterDisabled}
          style={ACTION_KEY_STYLE}
          aria-label="Submit move"
        >
          Enter
        </button>
        {ROW3_LETTERS.map((l) => (
          <LetterKey key={l} letter={l} onClick={() => onLetterKey(l)} disabled={letterKeyDisabled} />
        ))}
        <button
          onClick={onBackspace}
          disabled={backspaceDisabled}
          style={BACKSPACE_KEY_STYLE}
          aria-label="Remove letter"
        >
          ⌫
        </button>
      </div>
      <div style={{ display: 'flex', gap: '5px' }}>
        <button
          onClick={onSpace}
          disabled={spaceDisabled}
          style={SPACE_KEY_STYLE}
          aria-label="Insert space"
        >
          Space
        </button>
      </div>
    </div>
  );
}

function LetterKey({
  letter,
  onClick,
  disabled,
}: {
  letter: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={LETTER_KEY_STYLE}
      aria-label={`Letter ${letter}`}
    >
      {letter}
    </button>
  );
}
