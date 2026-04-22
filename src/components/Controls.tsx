type ControlsProps = {
  onSubmit: () => void;
  onRestore: () => void;
  restoreButtonDisabled: boolean;
  onInsertSpace: () => void;
  onRemoveLetter: () => void;
  removeButtonDisabled: boolean;
  onBuyHint: () => void;
  onBackToStart: () => void;
  backToStartDisabled: boolean;
  onReset: () => void;
  /** Label for the hint button, which varies with state */
  hintButtonLabel: string;
  hintButtonDisabled: boolean;
  gameOver: boolean;
};

/**
 * The row of action buttons. The hint, remove, restore, and back-to-start
 * buttons' disabled state are passed in from App because they depend on
 * game state (timer, current cell contents, diff from last committed
 * board, hard-mode setting) that App owns.
 */
export function Controls({
  onSubmit,
  onRestore,
  restoreButtonDisabled,
  onInsertSpace,
  onRemoveLetter,
  removeButtonDisabled,
  onBuyHint,
  onBackToStart,
  backToStartDisabled,
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
      <button
        onClick={onRestore}
        disabled={restoreButtonDisabled}
        style={{ flex: 1, minWidth: '120px' }}
      >
        Restore (Esc)
      </button>
      <button onClick={onInsertSpace} disabled={gameOver} style={{ flex: 1, minWidth: '110px' }}>
        Insert space
      </button>
      <button
        onClick={onRemoveLetter}
        disabled={removeButtonDisabled}
        style={{ flex: 1, minWidth: '130px' }}
      >
        Remove (⌫)
      </button>
      <button
        onClick={onBuyHint}
        disabled={hintButtonDisabled}
        style={{ flex: 1, minWidth: '150px' }}
      >
        {hintButtonLabel}
      </button>
      <button
        onClick={onBackToStart}
        disabled={backToStartDisabled}
        style={{ flex: 1, minWidth: '130px' }}
        title="Return to the seed word and restart the chain. Previous path stays blocked. Chain resets to ×1.0. Disabled in hard mode."
      >
        Back to start
      </button>
      {import.meta.env.DEV && (
        <button
          onClick={onReset}
          style={{ flex: 1, minWidth: '110px', opacity: 0.7 }}
          title="Dev-only: restart with a random seed. Hidden in production (daily-shared puzzle)."
        >
          New game (dev)
        </button>
      )}
    </div>
  );
}
