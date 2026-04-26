import { useEffect, useState } from 'react';

/**
 * ActivityBox — the pinball-display panel under the board.
 *
 * Two regions stacked vertically inside a dark recessed frame:
 *   - Top ~1/3:    quiet space (reserved for future content; today empty).
 *   - Bottom ~2/3: the active surface. The status message sits centered
 *                  here and cross-fades on every change (fade out the old
 *                  message → swap content → fade in the new). Animation
 *                  overlays (score popup, time-bonus badge, charge-
 *                  earned celebration) layer absolutely on top of this
 *                  same region so they share the visual real estate.
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

/** Map App's logical tone to the pinball-bright palette. */
function pinballColor(tone: StatusTone): string {
  switch (tone) {
    case 'success': return 'var(--gapplet-pinball-success)';
    case 'danger': return 'var(--gapplet-pinball-danger)';
    case 'warning': return 'var(--gapplet-pinball-hint)';
    case 'info': return 'var(--gapplet-pinball-accent)';
    default: return 'var(--gapplet-pinball-muted)';
  }
}

const FADE_MS = 350;

export function ActivityBox({ event, statusMessage, tone }: Props) {
  // Cross-fade pipeline: when statusMessage or tone changes, fade out
  // the currently-visible text, swap to the new content, fade in.
  // shown.visible drives a CSS opacity transition on the same div, so
  // the swap happens while opacity is at 0 — no flash.
  const [shown, setShown] = useState<{ msg: string; tone: StatusTone; visible: boolean }>(
    { msg: statusMessage, tone, visible: true }
  );

  useEffect(() => {
    if (statusMessage === shown.msg && tone === shown.tone) return;
    setShown((s) => ({ ...s, visible: false }));
    const t = setTimeout(() => {
      setShown({ msg: statusMessage, tone, visible: true });
    }, FADE_MS);
    return () => clearTimeout(t);
  }, [statusMessage, tone, shown.msg, shown.tone]);

  return (
    <div
      className="gapplet-pinball"
      style={{
        minHeight: '88px',
        margin: '8px 0 1rem',
        padding: '0 16px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {/* Top region — quiet space. Currently empty; reserved for future
          content (e.g., chain multiplier readout, brand strip, etc.). */}
      <div
        aria-hidden="true"
        style={{ flex: '0 0 26px' }}
      />

      {/* Bottom region — the active 2/3. Status text cross-fades here;
          animation overlays layer absolutely on top. */}
      <div
        style={{
          flex: '1 1 auto',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: '12px',
        }}
      >
        <div
          style={{
            opacity: shown.visible ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease-out`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div
            className="pinball-status"
            style={{
              fontSize: '19px',
              lineHeight: 1.3,
              color: pinballColor(shown.tone),
              fontWeight: shown.tone === 'info' || shown.tone === 'warning' ? 600 : 500,
              textAlign: 'center',
            }}
          >
            {shown.msg}
          </div>
          {/* Broken-chain icon: shows on any chain-break (tone='danger')
              that isn't a soap penalty (those carry their own 🧼 already). */}
          {shown.tone === 'danger' && !shown.msg.startsWith('🧼') && (
            <div
              key={`bc-${shown.msg}`}
              className="broken-chain-icon"
              aria-hidden="true"
            >
              ⛓️‍💥
            </div>
          )}
        </div>

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
