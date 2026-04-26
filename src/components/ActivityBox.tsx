import { useEffect, useState } from 'react';

/**
 * ActivityBox — the pinball-display panel under the board.
 *
 * Two states:
 *
 *   READY (game hasn't started, no input yet):
 *     - Top half:    static "Ready for you to start"
 *     - Bottom half: marquee scrolling "Drag a tile or tap a cell to start."
 *                    right-to-left, looping continuously.
 *
 *   PLAYING / GAME-OVER (the rest of the time):
 *     - Top half:    quiet space
 *     - Bottom half: status message centered, cross-fading on each change
 *                    (fade out → swap → fade in over FADE_MS each direction).
 *                    Animation overlays (score popup, time-bonus pill,
 *                    charge-earned card) layer absolutely on this region.
 *
 * The whole content is wrapped in a single opacity-transitioned div, so a
 * change of any of (statusMessage, tone, isReady) triggers a single
 * cross-fade — no jarring snap when the ready state ends.
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
  /** True when the game hasn't started yet (no clock running, no game-over). */
  isReady: boolean;
};

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

const READY_TOP_LINE = 'Ready for you to start';
const READY_MARQUEE_LINE = 'Drag a tile or tap a cell to start.';

type ShownState = {
  msg: string;
  tone: StatusTone;
  isReady: boolean;
  visible: boolean;
};

export function ActivityBox({ event, statusMessage, tone, isReady }: Props) {
  const [shown, setShown] = useState<ShownState>({
    msg: statusMessage,
    tone,
    isReady,
    visible: true,
  });

  useEffect(() => {
    if (
      statusMessage === shown.msg &&
      tone === shown.tone &&
      isReady === shown.isReady
    ) {
      return;
    }
    setShown((s) => ({ ...s, visible: false }));
    const t = setTimeout(() => {
      setShown({ msg: statusMessage, tone, isReady, visible: true });
    }, FADE_MS);
    return () => clearTimeout(t);
  }, [statusMessage, tone, isReady, shown.msg, shown.tone, shown.isReady]);

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
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          opacity: shown.visible ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease-out`,
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Top half */}
        <div
          style={{
            flex: '1 1 50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {shown.isReady && (
            <div
              className="pinball-status"
              style={{
                fontSize: '19px',
                lineHeight: 1.2,
                color: 'var(--gapplet-pinball-accent)',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              {READY_TOP_LINE}
            </div>
          )}
        </div>

        {/* Bottom half */}
        <div
          style={{
            flex: '1 1 50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {shown.isReady ? (
            <Marquee text={READY_MARQUEE_LINE} />
          ) : (
            <PlayingStatus msg={shown.msg} tone={shown.tone} />
          )}

          {/* Animation overlays only fire post-ready (event is null in ready). */}
          {!shown.isReady && event && event.earned > 0 && (
            <ScorePopup
              key={`score-${event.id}`}
              earned={event.earned}
              multiplier={event.multiplier}
              isStar={event.isStar}
              isHint={event.isHint}
            />
          )}
          {!shown.isReady && event && event.timeBonus > 0 && (
            <TimeBonusBadge key={`time-${event.id}`} seconds={event.timeBonus} />
          )}
          {!shown.isReady && event && event.chargeEarned && (
            <ChargeEarned key={`charge-${event.id}`} />
          )}
        </div>
      </div>
    </div>
  );
}

function PlayingStatus({ msg, tone }: { msg: string; tone: StatusTone }) {
  return (
    <div
      style={{
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
          color: pinballColor(tone),
          fontWeight: tone === 'info' || tone === 'warning' ? 600 : 500,
          textAlign: 'center',
        }}
      >
        {msg}
      </div>
      {/* Broken-chain icon: shows on any chain-break (tone='danger') that
          isn't a soap penalty (those carry their own 🧼 already). */}
      {tone === 'danger' && !msg.startsWith('🧼') && (
        <div
          key={`bc-${msg}`}
          className="broken-chain-icon"
          aria-hidden="true"
        >
          ⛓️‍💥
        </div>
      )}
    </div>
  );
}

function Marquee({ text }: { text: string }) {
  // Two identical copies in the track, padded so each copy is wider than
  // any reasonable container — that keeps the loop seamless (no empty gap
  // when the track has scrolled exactly one copy width). Glasses motif
  // 👓 flanks each instance so the eyeglasses theme from the logo
  // recurs as the text scrolls past.
  const item = (
    <>
      <span className="marquee-glasses" aria-hidden="true">👓</span>
      <span>{text}</span>
      <span className="marquee-glasses" aria-hidden="true">👓</span>
    </>
  );
  return (
    <div className="pinball-marquee">
      <div className="pinball-marquee-track">
        <span className="pinball-marquee-item">{item}</span>
        <span className="pinball-marquee-item" aria-hidden="true">{item}</span>
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
