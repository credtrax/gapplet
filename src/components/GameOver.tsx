import { SPACE } from '../lib/letterValues';
import type { HistoryEntry } from '../App';
import { Leaderboard } from './Leaderboard';
import { ShareButton } from './ShareButton';

type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'succeeded'; gameId: number; finalScore: number; chainPeak: number }
  | { status: 'failed'; error: string }
  | { status: 'duplicate' }
  | { status: 'unauthenticated' }
  | { status: 'practice' };

type GameOverProps = {
  history: HistoryEntry[];
  score: number;
  startSeed: string;
  seedDate: string;
  submission: SubmissionState;
};

/**
 * The end-of-game summary card. Shown after the clock hits 0.
 * Row 1 shows the seed. Each later row shows the transition from the
 * previous board state to the new one (`PREV → NEW +points`), so the
 * chain reads naturally top-to-bottom.
 *
 * Also renders the leaderboard-submission status. Game-end triggers a
 * POST to the validate-score Edge Function for signed-in daily-mode
 * games; the card surfaces success / failure / skip states inline.
 */
export function GameOver({ history, score, startSeed, seedDate, submission }: GameOverProps) {
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
      <div style={{ fontSize: '13px', color: 'var(--gapplet-muted)', marginBottom: '0.75rem' }}>
        Final score: {score} over {moves} moves ({hintedCount} hinted). Seed: {startSeed}.
      </div>
      <SubmissionBadge submission={submission} />
      {submission.status === 'succeeded' && (
        <div style={{ marginTop: '0.75rem' }}>
          <ShareButton
            history={history}
            finalScore={submission.finalScore}
            chainPeak={submission.chainPeak}
            seedDate={seedDate}
            hardMode={false}
          />
        </div>
      )}
      <div style={{ height: '1rem' }} />
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
          const prevDisplay = history[i - 1].board
            .map((c) => (c === SPACE ? '·' : c))
            .join('');
          return (
            <div key={i}>
              <span style={{ color: 'var(--gapplet-muted)' }}>{i + 1}.</span>{' '}
              <span style={{ color: 'var(--gapplet-muted)' }}>{prevDisplay}</span>
              <span style={{ color: 'var(--gapplet-muted)' }}>{' → '}</span>
              <span style={{ fontWeight: 500 }}>{display}</span>{' '}
              <span style={{ color: 'var(--gapplet-success)' }}>+{h.points}</span>
              {h.hinted && h.minuteUsed != null && (
                <span style={{ color: 'var(--gapplet-hint)' }}>
                  {' '}
                  [hint • min {h.minuteUsed}]
                </span>
              )}
              {h.restructured && (
                <span style={{ color: 'var(--gapplet-accent)' }}>
                  {' '}
                  [back to start]
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: '1.25rem' }}>
        <Leaderboard
          seedDate={seedDate}
          isHardMode={false}
          refreshKey={submission.status === 'succeeded' ? submission.gameId : 'pending'}
        />
      </div>
    </div>
  );
}

function SubmissionBadge({ submission }: { submission: SubmissionState }) {
  const base: React.CSSProperties = {
    fontSize: '13px',
    padding: '6px 10px',
    borderRadius: '6px',
    display: 'inline-block',
  };
  switch (submission.status) {
    case 'idle':
      return null;
    case 'submitting':
      return (
        <div style={{ ...base, background: 'rgba(0, 0, 0, 0.04)', color: 'var(--gapplet-muted)' }}>
          Submitting score…
        </div>
      );
    case 'succeeded':
      return (
        <div style={{ ...base, background: 'rgba(5, 150, 105, 0.1)', color: 'var(--gapplet-success)' }}>
          ✓ Posted to leaderboard · verified {submission.finalScore} pts · ×{submission.chainPeak.toFixed(1)} peak
        </div>
      );
    case 'duplicate':
      return (
        <div style={{ ...base, background: 'rgba(0, 0, 0, 0.04)', color: 'var(--gapplet-muted)' }}>
          Already submitted a score for today's puzzle. Come back tomorrow.
        </div>
      );
    case 'unauthenticated':
      return (
        <div style={{ ...base, background: 'rgba(59, 130, 246, 0.08)', color: 'var(--gapplet-accent)' }}>
          Sign in to post this score to the leaderboard.
        </div>
      );
    case 'practice':
      return (
        <div style={{ ...base, background: 'rgba(0, 0, 0, 0.04)', color: 'var(--gapplet-muted)' }}>
          Practice game — not posted to leaderboard.
        </div>
      );
    case 'failed':
      return (
        <div style={{ ...base, background: 'rgba(220, 38, 38, 0.08)', color: 'var(--gapplet-danger)' }}>
          Failed to post: {submission.error}
        </div>
      );
  }
}
