import { SPACE } from '../lib/letterValues';
import type { HistoryEntry } from '../App';

type GameOverProps = {
  history: HistoryEntry[];
  score: number;
  startSeed: string;
};

/**
 * The end-of-game summary card. Shown after the clock hits 0.
 * Displays every move, what word(s) it formed, points earned, and whether
 * it was hinted (with which minute the hint was used in).
 */
export function GameOver({ history, score, startSeed }: GameOverProps) {
  const moves = history.length - 1;
  const hintedCount = history.filter((h) => h.hinted).length;

  return (
    <div
      style={{
        marginTop: '1.5rem',
        background: 'var(--gapplet-cell-bg)',
        border: '0.5px solid var(--gapplet-border)',
        borderRadius: '8px',
        padding: '1rem 1.25rem',
      }}
    >
      <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: '0.5rem' }}>
        Game over
      </div>
      <div style={{ fontSize: '13px', color: 'var(--gapplet-muted)', marginBottom: '1rem' }}>
        Final score: {score} over {moves} moves ({hintedCount} hinted). Seed: {startSeed}.
      </div>
      <div
        style={{
          fontSize: '11px',
          color: 'var(--gapplet-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '6px',
        }}
      >
        Full chain
      </div>
      <div style={{ fontSize: '13px', fontFamily: 'monospace', lineHeight: 1.9 }}>
        {history.map((h, i) => {
          const display = h.board.map((c) => (c === SPACE ? '·' : c)).join('');
          if (h.initial) {
            return (
              <div key={i}>
                <span style={{ color: 'var(--gapplet-muted)' }}>{i + 1}.</span>{' '}
                <span style={{ fontWeight: 500 }}>{display}</span>{' '}
                <span style={{ color: 'var(--gapplet-muted)' }}>(seed)</span>
              </div>
            );
          }
          return (
            <div key={i}>
              <span style={{ color: 'var(--gapplet-muted)' }}>{i + 1}.</span>{' '}
              <span style={{ fontWeight: 500 }}>{display}</span> — {h.words.join(' + ')}{' '}
              <span style={{ color: 'var(--gapplet-success)' }}>+{h.points}</span>
              {h.hinted && h.minuteUsed != null && (
                <span style={{ color: 'var(--gapplet-hint)' }}>
                  {' '}
                  [hint • min {h.minuteUsed}]
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
