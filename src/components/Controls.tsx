type ControlsProps = {
  onSubmit: () => void;
  onInsertSpace: () => void;
  onBuyHint: () => void;
  onReset: () => void;
  /** Label for the hint button, which varies with state */
  hintButtonLabel: string;
  hintButtonDisabled: boolean;
  gameOver: boolean;
};

/**
 * The row of action buttons. The hint button's label and disabled state
 * are passed in from App because they depend on timer state, which App
 * owns.
 */
export function Controls({
  onSubmit,
  onInsertSpace,
  onBuyHint,
  onReset,
  hintButtonLabel,
  hintButtonDisabled,
  gameOver,
}: ControlsProps) {
  return (
    <div className="flex gap-2 flex-wrap mb-3">
      <button onClick={onSubmit} disabled={gameOver} style={{ flex: 2, minWidth: '160px' }}>
        Submit move (Enter)
      </button>
      <button onClick={onInsertSpace} disabled={gameOver} style={{ flex: 1, minWidth: '110px' }}>
        Insert space
      </button>
      <button
        onClick={onBuyHint}
        disabled={hintButtonDisabled}
        style={{ flex: 1, minWidth: '150px' }}
      >
        {hintButtonLabel}
      </button>
      <button onClick={onReset} style={{ flex: 1, minWidth: '110px' }}>
        New game
      </button>
    </div>
  );
}
