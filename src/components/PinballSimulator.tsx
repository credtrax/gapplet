import { useRef, useState } from 'react';
import { ActivityBox, type ActivityEvent } from './ActivityBox';

/**
 * PinballSimulator — preview/sandbox for the activity-box panel.
 *
 * Loaded when the URL has ?simulator=1. Renders the ActivityBox in
 * isolation with a button grid that triggers each canonical state of
 * the panel — ready, scoring, special moments, failures, tools,
 * game-over. Lets us tune copy, timings, colors, and animations
 * without playing a full game to reach each state.
 *
 * Re-clicking the same scenario re-fires the celebration animation
 * because we increment a monotonic event id (so React re-keys the
 * celebration child) regardless of whether the message changed.
 */

type Tone = 'info' | 'success' | 'warning' | 'danger' | null;

type Scenario = {
  label: string;
  category: string;
  msg: string;
  tone: Tone;
  isReady: boolean;
  event: Omit<ActivityEvent, 'id'> | null;
  /** Optional override for the ready-state top line. */
  readyTopLine?: string;
  /** Sample seconds remaining; only matters for the clock-running display. */
  timeLeft?: number;
};

const SCENARIOS: Scenario[] = [
  // --- State ---
  {
    label: 'Ready (signed in, named)',
    category: 'State',
    msg: 'Ready — drag a tile, or tap a cell, to start.',
    tone: 'info',
    isReady: true,
    event: null,
    readyTopLine: 'Ready for you to start, Joseph Corn.',
  },
  {
    label: 'Ready (signed in, no name)',
    category: 'State',
    msg: 'Ready — drag a tile, or tap a cell, to start.',
    tone: 'info',
    isReady: true,
    event: null,
    readyTopLine: 'Ready for you to start',
  },
  {
    label: 'Ready (signed out)',
    category: 'State',
    msg: 'Ready — drag a tile, or tap a cell, to start.',
    tone: 'info',
    isReady: true,
    event: null,
    readyTopLine: 'Sign in to save your score to the leaderboard',
  },
  {
    label: 'Clock running',
    category: 'State',
    msg: 'Clock running. Drag a tile onto the board.',
    tone: null,
    isReady: false,
    event: null,
    timeLeft: 110,
  },

  // --- Successful moves ---
  {
    label: 'Good +6',
    category: 'Successful moves',
    msg: 'Good: RAGS • 1.2× = +6',
    tone: 'success',
    isReady: false,
    event: {
      earned: 6,
      isStar: false,
      isHint: false,
      multiplier: 1.2,
      timeBonus: 0,
      chargeEarned: false,
    },
  },
  {
    label: 'Good +14 (with 0:02)',
    category: 'Successful moves',
    msg: 'Good: RAGED • 1.4× = +14  0:02!',
    tone: 'success',
    isReady: false,
    event: {
      earned: 14,
      isStar: false,
      isHint: false,
      multiplier: 1.4,
      timeBonus: 2,
      chargeEarned: false,
    },
  },
  {
    label: 'Star move +24',
    category: 'Successful moves',
    msg: '★ Star move: AD IT • chain doubled to 2.4× = +24',
    tone: 'success',
    isReady: false,
    event: {
      earned: 24,
      isStar: true,
      isHint: false,
      multiplier: 2.4,
      timeBonus: 0,
      chargeEarned: false,
    },
  },
  {
    label: 'Hint move +14',
    category: 'Successful moves',
    msg: 'Hint used: BREAD • 1.4× = +14 (chain held)',
    tone: 'warning',
    isReady: false,
    event: {
      earned: 14,
      isStar: false,
      isHint: true,
      multiplier: 1.4,
      timeBonus: 0,
      chargeEarned: false,
    },
  },

  // --- Bonus moments ---
  {
    label: 'Time bonus (+18 0:02)',
    category: 'Bonus moments',
    msg: 'Good: BAKER • 1.6× = +18  0:02!',
    tone: 'success',
    isReady: false,
    event: {
      earned: 18,
      isStar: false,
      isHint: false,
      multiplier: 1.6,
      timeBonus: 2,
      chargeEarned: false,
    },
  },
  {
    label: 'Charge earned (+20)',
    category: 'Bonus moments',
    msg: 'Good: BAKED • 1.6× = +20',
    tone: 'success',
    isReady: false,
    event: {
      earned: 20,
      isStar: false,
      isHint: false,
      multiplier: 1.6,
      timeBonus: 0,
      chargeEarned: true,
    },
  },
  {
    label: 'Mega (★ + bonus + charge)',
    category: 'Bonus moments',
    msg: '★ Star move: BAK ER • chain doubled to 2.0× = +28  0:02!',
    tone: 'success',
    isReady: false,
    event: {
      earned: 28,
      isStar: true,
      isHint: false,
      multiplier: 2.0,
      timeBonus: 2,
      chargeEarned: true,
    },
  },

  // --- Failures ---
  {
    label: 'Invalid word',
    category: 'Failures',
    msg: '"MUNGE" isn\'t in the dictionary. Chain broken.',
    tone: 'danger',
    isReady: false,
    event: null,
  },
  {
    label: 'Repeat config',
    category: 'Failures',
    msg: 'Already played that exact configuration. Chain broken.',
    tone: 'danger',
    isReady: false,
    event: null,
  },
  {
    label: 'Soap penalty',
    category: 'Failures',
    msg: '🧼 Naughty word — chain broken, −5 seconds. (Wash your mouth out.)',
    tone: 'danger',
    isReady: false,
    event: null,
  },

  // --- Tools ---
  {
    label: 'Restart chain',
    category: 'Tools',
    msg:
      'Back to RAGES. Chain reset to ×1.0. Previous path stays blocked — find a new first move.',
    tone: 'warning',
    isReady: false,
    event: null,
  },
  {
    label: 'Eliminate active',
    category: 'Tools',
    msg: 'Eliminate active: 17 letters greyed out. Chain reset to ×1.0.',
    tone: 'warning',
    isReady: false,
    event: null,
  },
  {
    label: 'Need more for hint',
    category: 'Tools',
    msg: 'Earn 23 more points to unlock another hint.',
    tone: 'info',
    isReady: false,
    event: null,
  },
  {
    label: 'No-op (no change)',
    category: 'Tools',
    msg: 'No change.',
    tone: 'info',
    isReady: false,
    event: null,
  },

  // --- End ---
  {
    label: "Game over (time's up)",
    category: 'End',
    msg: 'Time! See your full chain below.',
    tone: 'success',
    isReady: false,
    event: null,
  },
];

export function PinballSimulator() {
  const [current, setCurrent] = useState<Scenario>(SCENARIOS[0]);
  const idRef = useRef(0);
  const [event, setEvent] = useState<ActivityEvent | null>(null);

  const trigger = (s: Scenario) => {
    idRef.current += 1;
    setCurrent({ ...s });
    setEvent(s.event ? { ...s.event, id: idRef.current } : null);
  };

  const byCategory = SCENARIOS.reduce<Record<string, Scenario[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return (
    <div
      style={{
        maxWidth: '640px',
        margin: '0 auto',
        padding: '2rem 1rem',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '0.5rem',
        }}
      >
        <div style={{ fontSize: '20px', fontWeight: 500 }}>Pinball Simulator</div>
        <a href="?" style={{ fontSize: '12px', color: 'var(--gapplet-muted)' }}>
          ← back to game
        </a>
      </div>
      <div
        style={{
          fontSize: '12px',
          color: 'var(--gapplet-muted)',
          marginBottom: '1rem',
        }}
      >
        Click any button to set the panel state. Re-clicking the same scenario
        re-fires its celebration animation.
      </div>

      <ActivityBox
        event={event}
        statusMessage={current.msg}
        tone={current.tone}
        isReady={current.isReady}
        readyTopLine={current.readyTopLine}
        timeLeft={current.timeLeft}
      />

      <div
        style={{
          fontSize: '11px',
          color: 'var(--gapplet-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginTop: '1.25rem',
          marginBottom: '6px',
        }}
      >
        Currently showing: <strong>{current.label}</strong>
      </div>

      {Object.entries(byCategory).map(([category, scenarios]) => (
        <div key={category} style={{ marginTop: '1.25rem' }}>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--gapplet-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '6px',
            }}
          >
            {category}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {scenarios.map((s) => (
              <button
                key={s.label}
                onClick={() => trigger(s)}
                style={{
                  fontSize: '13px',
                  padding: '0.5rem 0.75rem',
                  fontWeight: current.label === s.label ? 600 : 500,
                  borderColor:
                    current.label === s.label ? 'var(--gapplet-fg)' : undefined,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
