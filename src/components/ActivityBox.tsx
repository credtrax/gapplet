/**
 * ActivityBox — the pinball-display panel under the board.
 *
 * Dark recessed frame with LED-glow text. Top line is the live status
 * message in a tone-mapped bright color; bottom line is the animation
 * surface — score popups, time-bonus badges, and charge-earned
 * celebrations. Each animation is keyed off event.id so React
 * re-mounts and re-runs CSS keyframes on every new commit.
 */

export type ActivityEvent = {
  /** Monotonic ID; React keys off this so each commit re-runs the animations. */
  id: number;
  /** Points scored on this commit. 0 means no animation worth showing. */
  earned: number;
  /** Star move (chain doubled) — gold treatment + ★ glyph. */
  isStar: boolean;
  /** Hinted commit — muted treatment, "(hint)" tag. */
  isHint: boolean;
  /** Chain multiplier in effect for this commit. */
  multiplier: number;
  /** Seconds added by the time-bonus rule. 0 = no bonus on this move. */
  timeBonus: number;
  /** True if this commit pushed score across a POINTS_PER_HINT boundary. */
  chargeEarned: boolean;
};

type StatusTone = 'info' | 'success' | 'warning' | 'danger' | null;

type Props = {
  event: ActivityEvent | null;
  statusMessage: string;
  tone: StatusTone;
};

/** Map App's logical tone to the pinball-bright palette. Returns a CSS
 * variable so palette tweaks live in index.css. */
function pinballColor(tone: StatusTone): string {
  switch (tone) {
    case 'success': return 'var(--gapplet-pinball-success)';
    case 'danger': return 'var(--gapplet-pinball-danger)';
    case 'warning': return 'var(--gapplet-pinball-hint)';
    case 'info': return 'var(--gapplet-pinball-accent)';
    default: return 'var(--gapplet-pinball-muted)';
  }
}

export function ActivityBox({ event, statusMessage, tone }: Props) {
  return (
    <div
      className="gapplet-pinball"
      style={{
        minHeight: '70px',
        margin: '8px 0 1rem',
        padding: '10px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        // Score popups float up out of the panel into the board's airspace.
        overflow: 'visible',
      }}
    >
      <div
        className="pinball-status"
        style={{
          fontSize: '14px',
          color: pinballColor(tone),
          fontWeight: tone === 'info' || tone === 'warning' ? 600 : 500,
          minHeight: '20px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {statusMessage}
      </div>
      <div
        aria-hidden="true"
        style={{
          minHeight: '28px',
          position: 'relative',
        }}
      >
        {event && event.earned > 0 && (
          <ScorePopup
            key={`score-${event.id}`}
            earned={event.earned}
            multiplier={event.multiplier}
            isStar={event.isStar}
            isHint={event.isHint}
          />
        )}
        {event && event.timeBonus > 0 && (
          <TimeBonusBadge key={`time-${event.id}`} seconds={event.timeBonus} />
        )}
        {event && event.chargeEarned && <ChargeEarned key={`charge-${event.id}`} />}
      </div>
    </div>
  );
}

function ScorePopup({
  earned,
  multiplier,
  isStar,
  isHint,
}: {
  earned: number;
  multiplier: number;
  isStar: boolean;
  isHint: boolean;
}) {
  const variant = isStar ? ' score-popup--star' : isHint ? ' score-popup--hint' : '';
  const suffix = isStar ? ' ★' : isHint ? ' hint' : '';
  return (
    <div className={`score-popup${variant}`}>
      +{earned}
      <span className="score-popup-multiplier">×{multiplier.toFixed(1)}</span>
      {suffix && <span className="score-popup-suffix">{suffix}</span>}
    </div>
  );
}

function TimeBonusBadge({ seconds }: { seconds: number }) {
  return <div className="time-bonus-badge">+{seconds}s</div>;
}

function ChargeEarned() {
  return (
    <div className="charge-earned">
      <div className="charge-earned-card">
        <img src="/word-nerd-logo.png" alt="" className="charge-earned-logo" />
        <span className="charge-earned-text">+1 hint</span>
      </div>
    </div>
  );
}
