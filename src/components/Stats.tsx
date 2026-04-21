type StatsProps = {
  timeLeft: number; // seconds remaining
  score: number;
  chain: number;
  timerStarted: boolean;
};

/**
 * The three stat cards across the top of the game: Time, Score, Chain.
 *
 * Before the clock starts, Time is shown in muted color to signal that
 * the game is waiting for the player. When under 10 seconds, Time turns
 * red as urgency cue.
 */
export function Stats({ timeLeft, score, chain, timerStarted }: StatsProps) {
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  const timeStr = `${m}:${s.toString().padStart(2, '0')}`;

  let timeColor = 'var(--gapplet-fg)';
  if (!timerStarted) {
    timeColor = 'var(--gapplet-muted)';
  } else if (timeLeft <= 10) {
    timeColor = 'var(--gapplet-danger)';
  }

  return (
    <div className="flex gap-2">
      <StatCard label="Time" value={timeStr} color={timeColor} />
      <StatCard label="Score" value={score.toString()} />
      <StatCard label="Chain" value={`×${chain.toFixed(1)}`} />
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: 'rgba(0, 0, 0, 0.04)',
        borderRadius: '6px',
        padding: '6px 12px',
        textAlign: 'center',
        minWidth: '62px',
      }}
    >
      <div
        style={{
          fontSize: '10px',
          color: 'var(--gapplet-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '18px',
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
          color: color ?? 'var(--gapplet-fg)',
        }}
      >
        {value}
      </div>
    </div>
  );
}
