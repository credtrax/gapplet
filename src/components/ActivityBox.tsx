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
  /** Seconds remaining on the clock. Drives the live countdown shown in
   * the "Clock running" two-line display. Updates re-render the
   * countdown text directly — no cross-fade per tick. */
  timeLeft?: number;
  /** Seconds remaining on the soap-penalty lockout. > 0 puts the panel
   * into the dedicated "🧼 Naughty Word" cleansing display with a live
   * green countdown and animated bubbles. Updates re-render the
   * countdown text directly — no cross-fade per tick. */
  soapPenaltyRemaining?: number;
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
const CLOCK_RUNNING_BOTTOM_LINE = 'Drag a tile onto the board';

/** Format seconds → "MM:SS". */
function fmtClock(s: number): string {
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

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
  if (event.timeBonus > 0) {
    const mm = Math.floor(event.timeBonus / 60);
    const ss = (event.timeBonus % 60).toString().padStart(2, '0');
    parts.push(`+${mm}:${ss}`);
  }
  if (event.chargeEarned) parts.push('+1 hint earned');
  return parts.join(' · ');
}

type ShownState = {
  msg: string;
  tone: StatusTone;
  isReady: boolean;
  readyTopLine: string;
  isSoapActive: boolean;
  visible: boolean;
};

export function ActivityBox({
  event,
  statusMessage,
  tone,
  isReady,
  readyTopLine = DEFAULT_READY_TOP_LINE,
  timeLeft,
  soapPenaltyRemaining = 0,
}: Props) {
  const isSoapActive = soapPenaltyRemaining > 0;
  const [shown, setShown] = useState<ShownState>({
    msg: statusMessage,
    tone,
    isReady,
    readyTopLine,
    isSoapActive,
    visible: true,
  });

  useEffect(() => {
    if (
      statusMessage === shown.msg &&
      tone === shown.tone &&
      isReady === shown.isReady &&
      readyTopLine === shown.readyTopLine &&
      isSoapActive === shown.isSoapActive
    ) {
      return;
    }
    setShown((s) => ({ ...s, visible: false }));
    const t = setTimeout(() => {
      setShown({
        msg: statusMessage,
        tone,
        isReady,
        readyTopLine,
        isSoapActive,
        visible: true,
      });
    }, FADE_MS);
    return () => clearTimeout(t);
  }, [
    statusMessage,
    tone,
    isReady,
    readyTopLine,
    isSoapActive,
    shown.msg,
    shown.tone,
    shown.isReady,
    shown.readyTopLine,
    shown.isSoapActive,
  ]);

  const isClockRunning =
    !shown.isReady && !shown.isSoapActive && shown.msg.startsWith('Clock running');
  const isChainBreak =
    !shown.isReady && !shown.isSoapActive && shown.tone === 'danger';
  const cel =
    !shown.isReady && !shown.isSoapActive && !isClockRunning && !isChainBreak
      ? celebrationText(event)
      : '';

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
          ) : shown.isSoapActive ? (
            <SoapPenaltyTop />
          ) : isClockRunning ? (
            <ClockRunningTop timeLeft={timeLeft ?? 0} />
          ) : isChainBreak ? (
            <ChainBreakReason reason={chainBreakReason(shown.msg)} />
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
          ) : shown.isSoapActive ? (
            <SoapCountdown remaining={soapPenaltyRemaining} />
          ) : isClockRunning ? (
            <ClockRunningBottom />
          ) : isChainBreak ? (
            <ChainBrokenIndicator key={`cb-${shown.msg}`} />
          ) : (
            <PlayingStatus msg={shown.msg} tone={shown.tone} />
          )}
        </div>
      </div>

      {/* Soap-bubbles overlay — covers the entire panel during the
          cleansing penalty. Each bubble is a CSS-keyframed loop with a
          staggered delay so they appear and disappear continuously
          across the 5-second lockout. Lives outside the cross-fade
          wrapper so the bubbles render at full opacity even when the
          panel is in mid-cross-fade. */}
      {shown.isSoapActive && <SoapBubbles />}
    </div>
  );
}

function ClockRunningTop({ timeLeft }: { timeLeft: number }) {
  return (
    <div
      className="pinball-status"
      style={{
        fontSize: '19px',
        lineHeight: 1.2,
        color: 'var(--gapplet-pinball-accent)',
        fontWeight: 600,
        textAlign: 'center',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <span className="time-emoji" aria-hidden="true">⏱️</span>
      <span>Clock Running &nbsp; {fmtClock(timeLeft)} remaining</span>
      <span className="time-emoji" aria-hidden="true">⏱️</span>
    </div>
  );
}

function ClockRunningBottom() {
  return (
    <div
      className="pinball-status"
      style={{
        fontSize: '19px',
        lineHeight: 1.2,
        color: 'var(--gapplet-pinball-muted)',
        fontWeight: 500,
        textAlign: 'center',
      }}
    >
      {CLOCK_RUNNING_BOTTOM_LINE}
    </div>
  );
}

function PlayingStatus({ msg, tone }: { msg: string; tone: StatusTone }) {
  // Game-over status reads "Time! See your full chain below." — flank
  // with stopwatch emojis so the moment lands as deliberate, not a
  // generic success message. Chain-break messages are handled separately
  // by the ActivityBox split-layout branch and never reach this component.
  const isGameOver = msg.startsWith('Time!');

  return (
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
        position: 'relative',
        zIndex: 1,
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
  );
}

/** Strip the trailing " Chain broken." (or any " ... Chain broken.") suffix
 * from a chain-break status message so the top half can display only the
 * reason — the bottom half handles the "Chain Broken" announcement. */
function chainBreakReason(msg: string): string {
  return msg.replace(/[.\s]*chain broken\.?[\s]*$/i, '').trim();
}

function ChainBreakReason({ reason }: { reason: string }) {
  return (
    <div
      className="pinball-status"
      style={{
        fontSize: '19px',
        lineHeight: 1.3,
        color: 'var(--gapplet-pinball-danger)',
        fontWeight: 500,
        textAlign: 'center',
        padding: '0 6px',
      }}
    >
      {reason}
    </div>
  );
}

function SoapPenaltyTop() {
  return (
    <div
      className="pinball-status soap-penalty-top"
      style={{
        fontSize: '17px',
        lineHeight: 1.3,
        color: 'var(--gapplet-pinball-danger)',
        fontWeight: 600,
        textAlign: 'center',
        padding: '0 6px',
      }}
    >
      <span className="soap-emoji" aria-hidden="true">🧼</span>{' '}
      Naughty Word - chain broken. 5 second cleansing penalty{' '}
      <span className="soap-emoji" aria-hidden="true">🧼</span>
    </div>
  );
}

function SoapCountdown({ remaining }: { remaining: number }) {
  return (
    <div
      className="pinball-status soap-countdown"
      style={{
        fontSize: '28px',
        lineHeight: 1.1,
        color: 'var(--gapplet-pinball-success)',
        fontWeight: 700,
        fontFamily: 'monospace',
        letterSpacing: '0.05em',
        textAlign: 'center',
      }}
    >
      0:0{Math.max(0, remaining)}
    </div>
  );
}

const SOAP_BUBBLES = [
  { left: '6%',  top: '18%', size: 14, delay: 0.0 },
  { left: '14%', top: '62%', size: 22, delay: 0.6 },
  { left: '24%', top: '32%', size: 16, delay: 1.1 },
  { left: '32%', top: '78%', size: 12, delay: 0.3 },
  { left: '40%', top: '15%', size: 20, delay: 0.9 },
  { left: '48%', top: '55%', size: 26, delay: 0.2 },
  { left: '56%', top: '25%', size: 14, delay: 1.4 },
  { left: '62%', top: '70%', size: 18, delay: 0.7 },
  { left: '70%', top: '20%', size: 22, delay: 1.0 },
  { left: '78%', top: '60%', size: 16, delay: 0.4 },
  { left: '86%', top: '35%', size: 20, delay: 1.3 },
  { left: '92%', top: '75%', size: 14, delay: 0.5 },
];

function SoapBubbles() {
  return (
    <div className="soap-bubbles" aria-hidden="true">
      {SOAP_BUBBLES.map((b, i) => (
        <span
          key={i}
          className="soap-bubble"
          style={{
            left: b.left,
            top: b.top,
            width: `${b.size}px`,
            height: `${b.size}px`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function ChainBrokenIndicator() {
  return (
    <div
      className="pinball-status"
      style={{
        fontSize: '19px',
        lineHeight: 1.2,
        color: 'var(--gapplet-pinball-danger)',
        fontWeight: 700,
        textAlign: 'center',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <span className="broken-chain-icon" aria-hidden="true">⛓️‍💥</span>
      <span>Chain Broken</span>
      <span className="broken-chain-icon" aria-hidden="true">⛓️‍💥</span>
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
