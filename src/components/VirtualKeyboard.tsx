import { useDrag, type DragSource } from '../lib/drag';

type VirtualKeyboardProps = {
  onLetterKey: (letter: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
  onRestartChain: () => void;
  onBuyHint: () => void;
  onEliminate: () => void;
  letterKeyDisabled: boolean;
  backspaceDisabled: boolean;
  spaceDisabled: boolean;
  restartChainDisabled: boolean;
  hintDisabled: boolean;
  eliminateDisabled: boolean;
  hintLabel: string;
  eliminateLabel: string;
  /** 0–100. Visual progress toward the next Buy Guess charge. */
  hintMeterPercent: number;
  /** 0–100. Visual progress toward the Eliminate idle unlock. */
  eliminateMeterPercent: number;
  /**
   * Letters that should be visually greyed out and blocked from drag/tap.
   * Populated by App when the Eliminate Useless Letters tool is active.
   */
  disabledLetters: Set<string>;
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

// Top-row tool buttons. Click-only (they act on game state, not on a cell).
// Position: relative so the absolute-positioned meter lands at the bottom.
const TOOL_KEY_STYLE: React.CSSProperties = {
  ...LETTER_KEY_STYLE,
  flex: 1,
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 600,
  minHeight: '46px',
  cursor: 'pointer',
  touchAction: 'manipulation',
  position: 'relative',
  overflow: 'hidden',
};

/**
 * Mobile-first on-screen keyboard, drag-input variant.
 *
 * Layout (top to bottom):
 *   [Restart Chain] [Buy Guess (n) ▮▮▮  ] [Eliminate ▮▮  ]   row 0: 3 tools
 *   Q W E R T Y U I O P                                       row 1
 *   A S D F G H J K L                                         row 2 (slight inset)
 *   Z X C V B N M [⌫]                                         row 3
 *   [               Space               ]                     row 4
 *
 * Top-row tools each show a thin progress meter at the bottom edge:
 *   - Restart Chain: no meter (always available; cost is the chain reset).
 *   - Buy Guess: meter fills score%100 → 0 each charge earned. Disabled
 *                when no charges are banked.
 *   - Eliminate: meter fills idleSeconds/10 → 0 on activation or commit.
 *                Disabled while < 10s idle, or while already active.
 *
 * Letter / Space / Backspace tiles are draggable — pointerdown on the tile
 * starts a drag and a drop on a board cell commits the move. A tap (no
 * drag movement) falls through to the click handler with the same effect
 * once a cell is selected.
 */
export function VirtualKeyboard({
  onLetterKey,
  onBackspace,
  onSpace,
  onRestartChain,
  onBuyHint,
  onEliminate,
  letterKeyDisabled,
  backspaceDisabled,
  spaceDisabled,
  restartChainDisabled,
  hintDisabled,
  eliminateDisabled,
  hintLabel,
  eliminateLabel,
  hintMeterPercent,
  eliminateMeterPercent,
  disabledLetters,
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
          style={TOOL_KEY_STYLE}
          aria-label="Restart chain — back to the seed word, chain resets"
          title="Return to the seed word. Chain resets to ×1.0. Previous path stays blocked."
        >
          Restart Chain
        </button>
        <button
          onClick={onBuyHint}
          disabled={hintDisabled}
          style={TOOL_KEY_STYLE}
          aria-label={`Buy Guess — ${hintLabel}`}
          title="Earn one charge per 100 points. Spend a charge to insert a free legal letter; the chain holds (does not advance) on hinted moves."
        >
          {hintLabel}
          <ToolMeter percent={hintMeterPercent} kind="hint" />
        </button>
        <button
          onClick={onEliminate}
          disabled={eliminateDisabled}
          style={TOOL_KEY_STYLE}
          aria-label={`Eliminate Useless Letters — ${eliminateLabel}`}
          title="Available after 10 seconds of inactivity. Greys out letters that can't form any legal next word. Costs your chain multiplier (resets to ×1.0)."
        >
          {eliminateLabel}
          <ToolMeter percent={eliminateMeterPercent} kind="eliminate" />
        </button>
      </div>
      <div style={{ display: 'flex', gap: '5px' }}>
        {ROW1.map((l) => (
          <DraggableLetterKey
            key={l}
            letter={l}
            disabled={letterKeyDisabled}
            culled={disabledLetters.has(l)}
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
            culled={disabledLetters.has(l)}
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
            culled={disabledLetters.has(l)}
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

/**
 * Thin progress bar pinned to the bottom edge of a tool button. Width is
 * driven by the percent prop; the CSS transition smooths small per-move
 * deltas. The colour key matches the tool: amber for the hint meter
 * (echoes the Buy Guess hint amber), green for eliminate (echoes the
 * drag-target highlight).
 */
function ToolMeter({ percent, kind }: { percent: number; kind: 'hint' | 'eliminate' }) {
  const color = kind === 'hint' ? 'var(--gapplet-hint)' : 'var(--gapplet-success)';
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        height: '3px',
        width: `${percent}%`,
        background: color,
        transition: 'width 0.5s ease-out',
        borderRadius: '0 0 5px 5px',
        pointerEvents: 'none',
      }}
    />
  );
}

function DraggableLetterKey({
  letter,
  disabled,
  culled,
  onTap,
  startDrag,
}: {
  letter: string;
  disabled: boolean;
  /** True when Eliminate has greyed this letter out. Block drag + tap and
   * dim the visual; users can't waste their move on a useless letter. */
  culled: boolean;
  onTap: () => void;
  startDrag: (source: DragSource, e: React.PointerEvent) => void;
}) {
  const inactive = disabled || culled;
  return (
    <button
      onPointerDown={(e) => {
        if (inactive) return;
        startDrag({ kind: 'letter', letter }, e);
      }}
      onClick={() => {
        if (inactive) return;
        onTap();
      }}
      disabled={disabled}
      style={{
        ...LETTER_KEY_STYLE,
        opacity: culled ? 0.28 : 1,
        cursor: culled ? 'not-allowed' : LETTER_KEY_STYLE.cursor,
        transition: 'opacity 0.25s ease-out',
      }}
      aria-label={`Letter ${letter}${culled ? ' (no legal moves)' : ''}`}
      aria-disabled={culled || undefined}
    >
      {letter}
    </button>
  );
}
