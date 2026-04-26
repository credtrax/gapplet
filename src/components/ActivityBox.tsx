/**
 * ActivityBox — the 2-line dopamine surface under the board.
 *
 * Top line: the live status message (passed through from App).
 * Bottom line: animation surface — score popups, time-bonus badges,
 * and charge-earned celebrations driven by `event` (one event per
 * successful commit, keyed by event.id so React re-mounts the
 * animation children whenever a new event lands).
 *
 * Each animation is a small component that uses CSS keyframes
 * (defined in index.css) and self-cleans by ending at opacity:0.
 * They render in absolute-positioned slots within the bottom line:
 *   - score popup: bottom-center, floats up out of the box
 *   - time-bonus badge: bottom-right, slides in then fades
 *   - charge celebration: center, scale-in / scale-out
 */

export type ActivityEvent = {
  /** Monotonic ID; React keys off this so each commit re-runs the animations. */
  id: number;
  /** Points scored on this commit. 0 means no animation worth showing. */
  earned: number;
  /** Star move (chain doubled) — gold treatment + ★ glyph. */
  isStar: boolean;
  /** Hinted commit — muted amber treatment, "(hint)" tag. */
  isHint: boolean;
  /** Chain multiplier in effect for this commit — shown next to score. */
  multiplier: number;
  /** Seconds added by the time-bonus rule. 0 = no bonus on this move. */
  timeBonus: number;
  /** True if this commit pushed score across a POINTS_PER_HINT boundary. */
  chargeEarned: boolean;
};

type Props = {
  event: ActivityEvent | null;
  statusMessage: string;
  messageColor: string;
  messageWeight: number;
};

export function ActivityBox({ event, statusMessage, messageColor, messageWeight }: Props) {
  return (
    <div
      style={{
        minHeight: '52px',
        margin: '6px 0 1rem',
        padding: '6px 0',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        // Let score popups overflow upward into the board's airspace.
        overflow: 'visible',
      }}
    >
      <div
        style={{
          fontSize: '14px',
          color: messageColor,
          fontWeight: messageWeight,
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
          minHeight: '24px',
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
  // Variant class picks the colour and the glyph suffix.
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
      <img src="/word-nerd-logo.png" alt="" className="charge-earned-logo" />
      <span className="charge-earned-text">+1 hint earned!</span>
    </div>
  );
}
