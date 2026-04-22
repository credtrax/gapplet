import { useState } from 'react';
import type { HistoryEntry } from '../App';
import { findNeighbors, boardKey, createdInteriorSplit } from '../lib/game';

const SHARE_URL = 'https://gapplet.joecorn.com';

type Props = {
  history: HistoryEntry[];
  finalScore: number;
  chainPeak: number;
  seedDate: string;
  hardMode: boolean;
};

/**
 * Share button — builds a compact, spoiler-free summary of the player's
 * game (emoji timeline, score, chain peak, chain count, move count) and
 * puts it on the clipboard. Uses the Web Share API on mobile (native
 * share sheet) and clipboard API as desktop fallback.
 *
 * Spoiler-free by design: no letters, no actual words. Readers who haven't
 * played today's puzzle can see the shape of the game but not the content.
 *
 * Emoji cascade per move (highest priority first):
 *   🟦  Restart Chain
 *   🟥  Move landed on a dead-end (board has zero unused one-swap neighbors)
 *   🟢  Star move — created an interior space split (index 1/2/3)
 *   🟨  Hinted move
 *   🟩  Normal successful move
 */
export function ShareButton({
  history,
  finalScore,
  chainPeak,
  seedDate,
  hardMode,
}: Props) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const buildShareText = (): string => {
    // Walk the committed history, maintaining seenConfigs-at-that-moment so
    // dead-end detection matches what was true when the move was played.
    const seen = new Set<string>([boardKey(history[0].board)]);
    const emojis: string[] = [];
    let chainCount = 1;

    for (let i = 1; i < history.length; i++) {
      const m = history[i];
      const prev = history[i - 1].board;

      if (m.restructured) {
        emojis.push('🟦');
        chainCount++;
        // Board is back to seed, already in seen set from init.
        continue;
      }

      // Add this move's board to seen, then check dead-end against it.
      seen.add(boardKey(m.board));
      const nbrs = findNeighbors(m.board);
      const isDeadEnd =
        nbrs.filter((n) => !seen.has(boardKey(n.board))).length === 0;

      if (isDeadEnd) {
        emojis.push('🟥');
      } else if (createdInteriorSplit(prev, m.board)) {
        emojis.push('🟢');
      } else if (m.hinted) {
        emojis.push('🟨');
      } else {
        emojis.push('🟩');
      }
    }

    const header = hardMode
      ? `Gapplet ${seedDate} · HARD`
      : `Gapplet ${seedDate}`;

    const chainLabel = hardMode ? '' : `${chainCount} chain${chainCount === 1 ? '' : 's'} · `;
    const stats = `${finalScore} pts · ${chainLabel}×${chainPeak.toFixed(1)} peak · ${history.length - 1} moves`;

    return [header, stats, emojis.join(''), SHARE_URL].join('\n');
  };

  const onShare = async () => {
    const text = buildShareText();

    // Prefer Web Share API when available (mobile native share sheet)
    const nav = navigator as Navigator & {
      share?: (data: { text: string }) => Promise<void>;
    };
    if (nav.share) {
      try {
        await nav.share({ text });
        setFeedback('Shared!');
      } catch (e) {
        // User cancelled share → silent no-op. Any other error → fall back to clipboard.
        if ((e as Error).name !== 'AbortError') {
          try {
            await navigator.clipboard.writeText(text);
            setFeedback('Copied to clipboard');
          } catch {
            setFeedback('Share failed');
          }
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setFeedback('Copied to clipboard');
      } catch {
        setFeedback('Copy failed');
      }
    }

    // Clear feedback after a moment
    if (feedback !== null) setTimeout(() => setFeedback(null), 2500);
    else setTimeout(() => setFeedback(null), 2500);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <button
        onClick={onShare}
        style={{
          padding: '0.5rem 1.25rem',
          fontSize: '14px',
          fontWeight: 500,
        }}
      >
        Share result
      </button>
      {feedback && (
        <span style={{ fontSize: '13px', color: 'var(--gapplet-muted)' }}>
          {feedback}
        </span>
      )}
    </div>
  );
}
