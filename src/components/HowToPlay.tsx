import { useEffect, useState, type ReactNode } from 'react';

type Slide = {
  title: string;
  body: ReactNode;
  visual: ReactNode;
};

const SLIDES: Slide[] = [
  {
    title: "Welcome to Joe's Word Nerd",
    body: (
      <>
        Five tiles. Two minutes. Drag tiles to chain together as many valid
        words as you can. Rare letters (Q, Z, J) score more.
      </>
    ),
    visual: (
      <img
        src="/word-nerd-logo.png"
        alt="Joe's Word Nerd"
        style={{
          maxWidth: '100%',
          height: 'auto',
          maxHeight: '160px',
          display: 'block',
        }}
      />
    ),
  },
  {
    title: 'Drag tiles to play',
    body: (
      <>
        Drag a letter from the keyboard onto a cell. Drop the{' '}
        <strong>⌫</strong> tile on a cell to remove it. Drop{' '}
        <strong>Space</strong> to insert a gap. Or drag one board cell onto
        another to <strong>swap</strong> them.
      </>
    ),
    visual: (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <MiniBoard cells={['W', 'A', 'T', 'E', 'R']} />
        <span style={{ fontSize: '18px', color: 'var(--gapplet-muted)' }}>→</span>
        <MiniBoard cells={['W', 'A', 'V', 'E', 'R']} highlight={2} />
      </div>
    ),
  },
  {
    title: 'Mind the gap',
    body: (
      <>
        A space is a playable cell. Three valid shapes:
        <ul style={{ margin: '0.5rem 0 0 1.2rem', padding: 0, lineHeight: 1.6 }}>
          <li>One 5-letter word</li>
          <li>A 4-letter word with an edge space</li>
          <li>Two words split by a middle space</li>
        </ul>
      </>
    ),
    visual: (
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}
      >
        <MiniBoard cells={['H', 'E', 'A', 'R', 'T']} caption="HEART" />
        <MiniBoard cells={['C', 'A', 'R', 'S', ' ']} caption="CARS + edge space" />
        <MiniBoard cells={['A', ' ', 'C', 'A', 'T']} caption="A + CAT" />
      </div>
    ),
  },
  {
    title: 'Chains build score',
    body: (
      <>
        Each valid move adds <strong>+0.2</strong> to your chain multiplier.
        Score = sum of letter values × multiplier. Repeat a board or play an
        invalid word and the chain resets to <strong>×1.0</strong>.
      </>
    ),
    visual: (
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: '13px',
          lineHeight: 1.8,
          textAlign: 'center',
        }}
      >
        <div>
          HEART <span style={{ color: 'var(--gapplet-success)' }}>×1.2</span> = 8 pts
        </div>
        <div>
          HEARS <span style={{ color: 'var(--gapplet-success)' }}>×1.4</span> = 9 pts
        </div>
        <div>
          HEARD <span style={{ color: 'var(--gapplet-success)' }}>×1.6</span> = 11 pts
        </div>
        <div>
          HEART <span style={{ color: 'var(--gapplet-danger)' }}>repeat → ×1.0</span>
        </div>
      </div>
    ),
  },
  {
    title: 'Star moves double your chain',
    body: (
      <>
        Drop the Space tile in the <strong>middle</strong> — position 2, 3, or
         4 — and your chain multiplier <strong>doubles</strong> (no cap). Star
        moves are rare and worth hunting. Shown as{' '}
        <span style={{ fontSize: '16px' }}>🟢</span> in the share.
      </>
    ),
    visual: (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <MiniBoard cells={['A', 'D', 'M', 'I', 'T']} caption="×1.4" />
        <span style={{ fontSize: '18px', color: 'var(--gapplet-muted)' }}>→</span>
        <MiniBoard cells={['A', 'D', ' ', 'I', 'T']} highlight={2} caption="×2.8 ★" />
      </div>
    ),
  },
  {
    title: 'Three tools at the top',
    body: (
      <ul style={{ margin: 0, padding: '0 0 0 1.1rem', lineHeight: 1.55 }}>
        <li>
          <strong>Restart Chain</strong> — back to the seed when you're stuck.
          Chain resets to ×1.0.
        </li>
        <li>
          <strong>Buy Guess</strong> — earn one charge per 100 points; spend it
          for a free legal letter (chain holds, doesn't advance).
        </li>
        <li>
          <strong>Eliminate</strong> — after 10s of inactivity, greys out the
          letters that can't form any next word. Costs your chain multiplier.
        </li>
      </ul>
    ),
    visual: (
      <div style={{ display: 'flex', gap: '4px', width: '100%', maxWidth: '300px' }}>
        <ToolMini label="Restart" />
        <ToolMini label="Buy Guess" meterColor="var(--gapplet-hint)" meterPercent={45} />
        <ToolMini label="Eliminate" meterColor="var(--gapplet-success)" meterPercent={70} />
      </div>
    ),
  },
  {
    title: 'Big plays earn time',
    body: (
      <>
        Any move scoring <strong>12+ points</strong> (after the multiplier) adds{' '}
        <strong>+2 seconds</strong> to your clock.{' '}
        <span style={{ fontSize: '16px' }}>🧼</span> Naughty words break your
        chain <em>and</em> cost <strong>5 seconds</strong>. Play nice.
      </>
    ),
    visual: (
      <div
        style={{
          display: 'flex',
          gap: '24px',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: 'monospace',
        }}
      >
        <div style={{ textAlign: 'center', color: 'var(--gapplet-success)' }}>
          <div style={{ fontSize: '28px', fontWeight: 700 }}>+2s</div>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            big play
          </div>
        </div>
        <div style={{ textAlign: 'center', color: 'var(--gapplet-danger)' }}>
          <div style={{ fontSize: '28px' }}>🧼</div>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            −5s
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'One puzzle a day',
    body: (
      <>
        Everyone plays the same seed each day (UTC midnight rotation). Your
        score posts to a global leaderboard. Share the emoji timeline —
        spoiler-free, fun to brag. Come back tomorrow for the next one.
      </>
    ),
    visual: (
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: '13px',
          lineHeight: 1.7,
          textAlign: 'center',
          color: 'var(--gapplet-fg)',
        }}
      >
        <div style={{ fontWeight: 500 }}>Joe's Word Nerd 2026-04-26</div>
        <div style={{ color: 'var(--gapplet-muted)' }}>847 pts · ×4.4 peak · 14 moves</div>
        <div style={{ fontSize: '18px', margin: '8px 0' }}>🟩🟩🟨🟢🟦🟩🟥🟢🟩🟩🟩🟩</div>
        <div style={{ color: 'var(--gapplet-muted)' }}>joecorn.com</div>
      </div>
    ),
  },
];

type Props = {
  onClose: () => void;
};

/**
 * First-time player tutorial — an 8-slide swipeable deck covering the
 * mechanics that new players need but that aren't obvious from the
 * stripped-down in-game UI. Auto-opens on first visit (localStorage
 * guarded in App.tsx); reopens via the "?" button in the header.
 *
 * Keyboard: ← → to navigate, Esc to close. (Local to this modal; the
 * game itself has no hardware keyboard input in the drag-input model.)
 */
export function HowToPlay({ onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const atLast = idx === SLIDES.length - 1;
  const atFirst = idx === 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && !atLast) setIdx(idx + 1);
      else if (e.key === 'ArrowLeft' && !atFirst) setIdx(idx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, atFirst, atLast, onClose]);

  const slide = SLIDES[idx];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How to play"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--gapplet-cell-bg)',
          border: '0.5px solid var(--gapplet-border)',
          borderRadius: '12px',
          padding: '1.5rem 1.25rem 1.25rem',
          maxWidth: '420px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '0.75rem',
          }}
        >
          <div style={{ fontSize: '18px', fontWeight: 500 }}>{slide.title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '18px',
              lineHeight: 1,
              border: 0,
              background: 'transparent',
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: '0.75rem 0',
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            minHeight: '160px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              margin: '0.5rem 0 1rem',
            }}
          >
            {slide.visual}
          </div>
          <div style={{ fontSize: '14px', lineHeight: 1.55 }}>{slide.body}</div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '6px',
            margin: '0.75rem 0',
          }}
          role="tablist"
          aria-label="Slide navigation"
        >
          {SLIDES.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setIdx(i)}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                padding: 0,
                border: 0,
                background:
                  i === idx ? 'var(--gapplet-fg)' : 'var(--gapplet-border)',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setIdx(idx - 1)} disabled={atFirst} style={{ flex: 1 }}>
            ← Prev
          </button>
          <button
            onClick={() => (atLast ? onClose() : setIdx(idx + 1))}
            style={{ flex: 1, fontWeight: 500 }}
          >
            {atLast ? 'Got it' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Miniature 5-tile board for illustrations. Uses the same palette tokens
 * as the real Board component so the tutorial visuals stay on-brand.
 * Optional `highlight` paints one cell as the changed cell. Optional
 * `caption` labels the state.
 */
function MiniBoard({
  cells,
  highlight,
  caption,
}: {
  cells: readonly string[];
  highlight?: number;
  caption?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <div style={{ display: 'flex', gap: '3px' }}>
        {cells.map((c, i) => {
          const isSpace = c === ' ';
          const isHi = i === highlight;
          const classes = ['gapplet-tile'];
          if (isSpace) classes.push('gapplet-tile--empty');
          return (
            <div
              key={i}
              className={classes.join(' ')}
              style={{
                width: '26px',
                height: '34px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 700,
                fontFamily: 'Georgia, "Times New Roman", serif',
                color: isSpace ? 'var(--gapplet-muted)' : 'var(--gapplet-tile-fg)',
                ...(isHi
                  ? {
                      boxShadow:
                        '0 0 0 2px var(--gapplet-success), 0 2px 4px var(--gapplet-tile-drop), inset 0 1px 0 var(--gapplet-tile-highlight), inset 0 -1px 0 var(--gapplet-tile-bevel)',
                    }
                  : null),
              }}
            >
              {isSpace ? '␣' : c}
            </div>
          );
        })}
      </div>
      {caption && (
        <div style={{ fontSize: '11px', color: 'var(--gapplet-muted)' }}>
          {caption}
        </div>
      )}
    </div>
  );
}

/**
 * Miniature tool button used by the "Three tools" tutorial slide. Mirrors
 * the real top-row button styling at small scale, with an optional meter
 * fill at the bottom for the Buy Guess and Eliminate states.
 */
function ToolMini({
  label,
  meterColor,
  meterPercent,
}: {
  label: string;
  meterColor?: string;
  meterPercent?: number;
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: '8px 4px',
        background: 'rgba(0, 0, 0, 0.08)',
        borderRadius: '4px',
        fontSize: '9px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        color: 'var(--gapplet-fg)',
      }}
    >
      {label}
      {meterColor !== undefined && meterPercent !== undefined && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            height: '2px',
            width: `${meterPercent}%`,
            background: meterColor,
          }}
        />
      )}
    </div>
  );
}
