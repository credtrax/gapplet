import { useEffect, useState } from 'react';

/**
 * ActivityBox — the pinball-display panel under the board.
 *
 * Layout: a dark recessed frame, two halves stacked vertically.
 *
 *   READY (game hasn't started, no input yet):
 *     Top:    static "Ready for you to start"
 *     Bottom: marquee scrolling "Drag a tile or tap a cell to start."
 *             right-to-left, looping continuously.
 *
 *   PLAYING / GAME-OVER:
 *     Top:    transient celebration line that fades in / out for each
 *             commit — "+47 · ★" or "+102 · +2s · +1 hint" etc.
 *             Empty between events. Replaces the floating score
 *             popup, time-bonus pill, and charge-earned card.
 *     Bottom: persistent status message, cross-fading on each change.
 *
 * Cross-fade pipeline: when statusMessage / tone / isReady changes,
 * the whole content opacity-transitions out, swaps, and back in.
 */

export type ActivityEvent = {
  /** Monotonic ID; React keys off this so each commit re-runs the celebration. */
  id: number;
  /** Points scored on this commit. 0 = no celebration worth showing. */
  earned: number;
  /** Star move (chain doubled). */
  isStar: boolean;
  /** Hinted commit. */
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
  /** Optional override for the ready-state top line. Defaults to the
   * generic "Ready for you to start". App swaps in a sign-in nudge
   * when the player isn't authenticated. */
  readyTopLine?: string;
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

const DEFAULT_READY_TOP_LINE = 'Ready for you to start';
const READY_MARQUEE_LINE = 'Drag a tile or tap a cell to start.';

/**
 * Build the top-line celebration string for a commit. Returns '' for
 * commits worth no celebration (chain breaks, no-ops). Pieces stack
 * with a "·" separator so a star move that also crossed a hint
 * threshold reads like "+102 · ★ · +1 hint".
 */
function celebrationText(event: ActivityEvent | null): string {
  if (!event || event.earned <= 0) return '';
  const parts: string[] = [`+${event.earned}`];
  if (event.isStar) parts.push('★');
  if (event.isHint) parts.push('hint');
  if (event.timeBonus > 0) parts.push(`+${event.timeBonus}s`);
  if (event.chargeEarned) parts.push('+1 hint earned');
  return parts.join(' · ');
}

type ShownState = {
  msg: string;
  tone: StatusTone;
  isReady: boolean;
  readyTopLine: string;
  visible: boolean;
};

export function ActivityBox({
  event,
  statusMessage,
  tone,
  isReady,
  readyTopLine = DEFAULT_READY_TOP_LINE,
}: Props) {
  const [shown, setShown] = useState<ShownState>({
    msg: statusMessage,
    tone,
    isReady,
    readyTopLine,
    visible: true,
  });

  useEffect(() => {
    if (
      statusMessage === shown.msg &&
      tone === shown.tone &&
      isReady === shown.isReady &&
      readyTopLine === shown.readyTopLine
    ) {
      return;
    }
    setShown((s) => ({ ...s, visible: false }));
    const t = setTimeout(() => {
      setShown({ msg: statusMessage, tone, isReady, readyTopLine, visible: true });
    }, FADE_MS);
    return () => clearTimeout(t);
  }, [
    statusMessage,
    tone,
    isReady,
    readyTopLine,
    shown.msg,
    shown.tone,
    shown.isReady,
    shown.readyTopLine,
  ]);

  const cel = !shown.isReady ? celebrationText(event) : '';

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
          {shown.isReady ? (
            <div
              className="pinball-status"
              style={{
                fontSize: '19px',
                lineHeight: 1.2,
                color: 'var(--gapplet-pinball-accent)',
                fontWeight: 600,
                textAlign: 'center',
                padding: '0 6px',
              }}
            >
              {shown.readyTopLine}
            </div>
          ) : (
            event && cel && (
              <div key={`cel-${event.id}`} className="pinball-celebration">
                {cel}
              </div>
            )
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
        </div>
      </div>
    </div>
  );
}

function PlayingStatus({ msg, tone }: { msg: string; tone: StatusTone }) {
  // Game-over status reads "Time! See your full chain below." — flank
  // with stopwatch emojis so the moment lands as deliberate, not a
  // generic success message.
  const isGameOver = msg.startsWith('Time!');

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
          display: 'inline-flex',
          alignItems: 'center',
          gap: isGameOver ? '12px' : 0,
        }}
      >
        {isGameOver && (
          <span className="time-emoji" aria-hidden="true">⏱️</span>
        )}
        <span>{msg}</span>
        {isGameOver && (
          <span className="time-emoji" aria-hidden="true">⏱️</span>
        )}
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
  // any reasonable container — that keeps the loop seamless. Glasses motif
  // 👓 flanks each instance to recur the eyeglasses theme from the logo.
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
