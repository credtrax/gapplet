type StatsProps = {
  timeLeft: number; // seconds remaining
  score: number;
  chain: number;
  timerStarted: boolean;
  /**
   * Count of one-swap neighbors of the last committed board that haven't
   * been played yet. Always rendered as a "Paths" stat card in normal mode
   * — it's part of the visible game state and adds strategic depth
   * (anticipate running out of moves, see when an edge/interior split
   * would widen the graph). Hidden/muted in hard mode.
   */
  neighborCount?: number;
  /**
   * When true, the Paths card renders as a muted "—" instead of the real
   * count — hard mode forces the player to rely on intuition.
   */
  hardMode?: boolean;
};

/**
 * Stat cards across the top of the game: Time, Score, Chain, Paths.
 *
 * Before the clock starts, Time is shown in muted color to signal that
 * the game is waiting for the player. When under 10 seconds, Time turns
 * red as urgency cue. Paths shows the live count of unused one-swap
 * neighbors in normal mode; in hard mode the card stays visible but
 * shows a muted placeholder — the player doesn't get to see the
 * numerical help, but they can still see that the stat exists.
 */
export function Stats({
  timeLeft,
  score,
  chain,
  timerStarted,
  neighborCount,
  hardMode,
}: StatsProps) {
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
      <StatCard
        label="Paths"
        value={hardMode ? '—' : (neighborCount ?? 0).toString()}
        muted={hardMode}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  muted,
}: {
  label: string;
  value: string;
  color?: string;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        background: 'rgba(0, 0, 0, 0.04)',
        borderRadius: '6px',
        padding: '6px 12px',
        textAlign: 'center',
        minWidth: '62px',
        opacity: muted ? 0.45 : 1,
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
