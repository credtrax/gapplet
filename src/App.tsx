import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Board } from './components/Board';
import { Stats } from './components/Stats';
import { Controls } from './components/Controls';
import { GameOver } from './components/GameOver';
import { pickSeed } from './lib/seeds';
import {
  validateBoard,
  findNeighbors,
  countDiffs,
  boardKey,
  advanceChain,
  scoreMove,
  scoreHintedMove,
  CHAIN_START,
  type Board as BoardType,
  type Neighbor,
} from './lib/game';
import { LETTER_VALUES, SPACE } from './lib/letterValues';

const GAME_DURATION_SECONDS = 120;

/**
 * A single entry in the move history. Exported so GameOver can type its props.
 */
export type HistoryEntry = {
  board: BoardType;
  words: string[];
  points: number;
  /** True for the seed row (move 0), false for all played moves */
  initial: boolean;
  /** True if this move was pre-placed by the "Buy a guess" button */
  hinted: boolean;
  /** Which minute the hint was used in (1 or 2), or null for normal moves */
  minuteUsed: number | null;
};

/**
 * Hint budget model: one hint per minute of play, no stacking.
 *
 * Minute 1 = timeLeft in (60, 120]
 * Minute 2 = timeLeft in [0, 60]
 *
 * If the player doesn't use their minute-1 hint before the clock crosses
 * 1:00, it's lost. This is the explicit "no stacking" rule.
 */
type HintsByWindow = { 1: number; 2: number };

/**
 * Message tones for the status line. Each maps to a color and sometimes
 * a font weight in setStatusMessage.
 */
type MessageTone = 'info' | 'success' | 'warning' | 'danger' | null;

export function App() {
  // --- Core game state ---
  const [board, setBoard] = useState<BoardType>(() => pickSeed().split(''));
  const [startSeed, setStartSeed] = useState<string>(() => board.join(''));
  const [score, setScore] = useState(0);
  const [chain, setChain] = useState(CHAIN_START);
  const [history, setHistory] = useState<HistoryEntry[]>(() => [
    {
      board: board.slice(),
      words: [board.join('')],
      points: 0,
      initial: true,
      hinted: false,
      minuteUsed: null,
    },
  ]);
  const [seenConfigs, setSeenConfigs] = useState<Set<string>>(
    () => new Set([boardKey(board)])
  );

  // --- Clock ---
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_SECONDS);
  const [timerStarted, setTimerStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const timerRef = useRef<number | null>(null);

  // --- Interaction ---
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [pendingHint, setPendingHint] = useState<Neighbor | null>(null);
  // When the player hits Remove, they've made one logical move but the
  // board representation changes in 2+ cells (everything shifts left).
  // This flag lets attemptSubmit bypass the countDiffs ≤ 1 check while
  // still running validateBoard and seen-configs.
  const [pendingRemoveSource, setPendingRemoveSource] = useState<number | null>(null);

  // --- Hint budget ---
  const [hintsByWindow, setHintsByWindow] = useState<HintsByWindow>({ 1: 0, 2: 0 });

  // --- Status line ---
  const [statusMessage, setStatusMessage] = useState<string>(
    'Ready — click any cell to start the clock.'
  );
  const [statusTone, setStatusTone] = useState<MessageTone>('info');

  // ------------------------------------------------------------------
  // Derived helpers
  // ------------------------------------------------------------------

  /** Which minute window are we currently in? */
  const currentWindow = (): 1 | 2 => (timeLeft > 60 ? 1 : 2);

  /** How many hints are left in the current window (0 or 1)? */
  const hintsLeftInWindow = (): number => {
    const w = currentWindow();
    return hintsByWindow[w] > 0 ? 0 : 1;
  };

  /**
   * How many unused one-swap neighbors exist from the last committed board?
   * Dev-only counter used for playtesting and potential future "taunt mode."
   * Memoized on history + seenConfigs so it only recomputes after a move,
   * not on every input event. ~135 dict lookups — sub-millisecond.
   */
  const unusedNeighborCount = useMemo(() => {
    if (gameOver) return 0;
    const current = history[history.length - 1].board;
    const neighbors = findNeighbors(current);
    return neighbors.filter((n) => !seenConfigs.has(boardKey(n.board))).length;
  }, [history, seenConfigs, gameOver]);

  // ------------------------------------------------------------------
  // Timer
  // ------------------------------------------------------------------

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          stopTimer();
          setGameOver(true);
          setStatusMessage('Time! See your full chain below.');
          setStatusTone('success');
          return 0;
        }
        return next;
      });
    }, 1000);
  }, [stopTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  /** Called on first interaction to kick off the clock. */
  const maybeStartClock = () => {
    if (!timerStarted && !gameOver) {
      setTimerStarted(true);
      setStatusMessage('Clock running. Change one cell, press Enter to submit.');
      setStatusTone(null);
      startTimer();
    }
  };

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  const resetGame = () => {
    stopTimer();
    const newSeed = pickSeed();
    const newBoard = newSeed.split('');
    setBoard(newBoard);
    setStartSeed(newSeed);
    setScore(0);
    setChain(CHAIN_START);
    setHistory([
      {
        board: newBoard.slice(),
        words: [newSeed],
        points: 0,
        initial: true,
        hinted: false,
        minuteUsed: null,
      },
    ]);
    setSeenConfigs(new Set([boardKey(newBoard)]));
    setTimeLeft(GAME_DURATION_SECONDS);
    setTimerStarted(false);
    setGameOver(false);
    setSelectedIdx(null);
    setPendingHint(null);
    setPendingRemoveSource(null);
    setHintsByWindow({ 1: 0, 2: 0 });
    setStatusMessage('Ready — click any cell to start the clock.');
    setStatusTone('info');
  };

  const attemptSubmit = () => {
    if (gameOver) return;
    if (!timerStarted) {
      setStatusMessage('Click a cell first to start the clock.');
      setStatusTone('info');
      return;
    }
    const prev = history[history.length - 1].board;
    const isRemoveMove = pendingRemoveSource != null;
    if (!isRemoveMove) {
      const diffs = countDiffs(prev, board);
      if (diffs === 0) {
        setStatusMessage("You haven't changed anything yet.");
        setStatusTone('danger');
        return;
      }
      if (diffs > 1) {
        setStatusMessage(`Only one cell can change per move. Currently changed: ${diffs}`);
        setStatusTone('danger');
        setChain(CHAIN_START);
        return;
      }
    }
    const v = validateBoard(board);
    if (!v.ok) {
      setStatusMessage(`${v.reason}. Chain broken.`);
      setStatusTone('danger');
      setChain(CHAIN_START);
      setBoard(prev.slice());
      setSelectedIdx(null);
      setPendingHint(null);
      setPendingRemoveSource(null);
      return;
    }
    const key = boardKey(board);
    if (seenConfigs.has(key)) {
      setStatusMessage('Already played that exact configuration. Chain broken.');
      setStatusTone('danger');
      setChain(CHAIN_START);
      setBoard(prev.slice());
      setSelectedIdx(null);
      setPendingHint(null);
      setPendingRemoveSource(null);
      return;
    }

    // Was this move placed by a hint?
    const wasHinted =
      pendingHint != null && boardKey(board) === boardKey(pendingHint.board);

    let earned: number;
    let newChain: number;

    if (wasHinted && pendingHint) {
      earned = scoreHintedMove(board, chain, pendingHint.placedChar);
      newChain = chain; // chain does NOT advance on hinted moves
      const placedVal =
        pendingHint.placedChar === SPACE ? 0 : (LETTER_VALUES[pendingHint.placedChar] ?? 0);
      setStatusMessage(
        `Hint used: ${v.words.join(' + ')} • board ${chain.toFixed(1)}× − ${placedVal} = +${earned} (chain held)`
      );
      setStatusTone('warning');
    } else {
      newChain = advanceChain(chain);
      earned = scoreMove(board, newChain);
      setStatusMessage(
        `Good: ${v.words.join(' + ')} • ${newChain.toFixed(1)}× = +${earned}`
      );
      setStatusTone('success');
    }

    setScore((s) => s + earned);
    setChain(newChain);
    setSeenConfigs((prev) => new Set(prev).add(key));
    setHistory((prev) => [
      ...prev,
      {
        board: board.slice(),
        words: v.words,
        points: earned,
        initial: false,
        hinted: wasHinted,
        minuteUsed: wasHinted ? currentWindow() : null,
      },
    ]);
    setSelectedIdx(null);
    setPendingHint(null);
    setPendingRemoveSource(null);
  };

  const insertSpace = () => {
    if (gameOver) return;
    if (selectedIdx == null) {
      setStatusMessage('Click a cell first, then press "Insert space" to turn it into a gap.');
      setStatusTone('danger');
      return;
    }
    maybeStartClock();
    setPendingHint(null);
    setPendingRemoveSource(null);
    setBoard((prev) => {
      const next = prev.slice();
      next[selectedIdx] = SPACE;
      return next;
    });
    setStatusMessage(`Cell ${selectedIdx + 1} is now a space. Press Enter to submit.`);
    setStatusTone(null);
  };

  /**
   * Revert any uncommitted edits, restoring the board to the last
   * successfully-submitted state (or the seed, if no moves yet). Doesn't
   * touch chain, score, history, or the timer — this is a pre-commit
   * escape hatch for "I just clicked four things by accident on mobile,"
   * not an undo-last-move.
   */
  const restoreBoard = () => {
    if (gameOver) return;
    const lastValid = history[history.length - 1].board;
    if (countDiffs(lastValid, board) === 0) return;
    setBoard(lastValid.slice());
    setSelectedIdx(null);
    setPendingHint(null);
    setPendingRemoveSource(null);
    setStatusMessage('Restored to the last committed board. Keep going.');
    setStatusTone('info');
  };

  /**
   * Remove the letter at the selected cell and shift everything to the right
   * of it one position left, leaving a trailing space. E.g. HEARD with A
   * selected becomes HERD·. This changes multiple cells in the board array
   * but counts as one logical move — attemptSubmit uses pendingRemoveSource
   * to bypass the countDiffs ≤ 1 rule while still running validateBoard.
   */
  const removeLetter = () => {
    if (gameOver) return;
    if (selectedIdx == null) {
      setStatusMessage('Click a letter cell first, then press Remove to shift the board left.');
      setStatusTone('danger');
      return;
    }
    if (board[selectedIdx] === SPACE) {
      setStatusMessage('Nothing to remove at that cell — it is already a space.');
      setStatusTone('danger');
      return;
    }
    maybeStartClock();
    const removedChar = board[selectedIdx];
    setPendingHint(null);
    setBoard((prev) => [
      ...prev.slice(0, selectedIdx),
      ...prev.slice(selectedIdx + 1),
      SPACE,
    ]);
    setPendingRemoveSource(selectedIdx);
    setSelectedIdx(null);
    setStatusMessage(
      `Removed "${removedChar}" — letters shifted, trailing space added. Press Enter to submit.`
    );
    setStatusTone(null);
  };

  const buyHint = () => {
    if (gameOver) return;
    if (!timerStarted) {
      setStatusMessage('Click a cell first to start the clock.');
      setStatusTone('info');
      return;
    }
    if (hintsLeftInWindow() <= 0) {
      const w = currentWindow();
      if (w === 1) {
        setStatusMessage('You already used your minute-1 hint. Next hint at 1:00.');
      } else {
        setStatusMessage('No hints left — minute-2 hint already used.');
      }
      setStatusTone('info');
      return;
    }
    const current = history[history.length - 1].board;
    const neighbors = findNeighbors(current);
    const unseen = neighbors.filter((n) => !seenConfigs.has(boardKey(n.board)));
    if (unseen.length === 0) {
      setStatusMessage('No legal moves from this position! Try restructuring.');
      setStatusTone('danger');
      return;
    }

    // Consume the hint immediately so the player can't repeatedly ask for
    // different hints within the same window.
    setHintsByWindow((h) => ({ ...h, [currentWindow()]: 1 }));

    const choice = unseen[Math.floor(Math.random() * unseen.length)];
    setPendingHint(choice);
    setPendingRemoveSource(null);
    setBoard(choice.board.slice());
    setSelectedIdx(choice.changedIdx);

    const costLabel =
      choice.placedChar === SPACE
        ? 'space (0 pts)'
        : `${choice.placedChar} (${LETTER_VALUES[choice.placedChar] ?? 0} pts)`;
    setStatusMessage(
      `Hint placed: ${choice.words.join(' + ')}. Press Enter to play — cost ${costLabel}, chain held.`
    );
    setStatusTone('warning');
  };

  // ------------------------------------------------------------------
  // Keyboard handler
  // ------------------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (gameOver) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        attemptSubmit();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        removeLetter();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        restoreBoard();
        return;
      }
      if (selectedIdx == null) return;
      if (/^[a-zA-Z]$/.test(e.key)) {
        maybeStartClock();
        setPendingHint(null); // typing a letter cancels any pending hint
        setPendingRemoveSource(null);
        setBoard((prev) => {
          const next = prev.slice();
          next[selectedIdx] = e.key.toUpperCase();
          return next;
        });
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        insertSpace();
        return;
      }
      if (e.key === 'ArrowLeft') {
        setSelectedIdx((i) => (i == null ? 0 : Math.max(0, i - 1)));
        return;
      }
      if (e.key === 'ArrowRight') {
        setSelectedIdx((i) => (i == null ? 0 : Math.min(4, i + 1)));
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // Intentionally re-subscribe when these change so the closure captures
    // fresh values. With more state, we'd pull this into a custom hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdx, board, gameOver, timerStarted, chain, pendingHint, pendingRemoveSource, history, seenConfigs]);

  // ------------------------------------------------------------------
  // Hint button label (derived from state)
  // ------------------------------------------------------------------

  const hintButtonLabel = (() => {
    if (gameOver) return 'Buy a guess';
    if (!timerStarted) return 'Buy a guess';
    const w = currentWindow();
    const left = hintsLeftInWindow();
    if (left > 0) return `Buy a guess (min ${w})`;
    if (w === 1) return 'Next hint at 1:00';
    return 'No hints left';
  })();

  const hintButtonDisabled =
    gameOver || (timerStarted && hintsLeftInWindow() <= 0);

  // ------------------------------------------------------------------
  // Message tone → CSS color
  // ------------------------------------------------------------------

  const messageColor = (() => {
    switch (statusTone) {
      case 'success': return 'var(--gapplet-success)';
      case 'danger': return 'var(--gapplet-danger)';
      case 'warning': return 'var(--gapplet-hint)';
      case 'info': return 'var(--gapplet-accent)';
      default: return 'var(--gapplet-muted)';
    }
  })();

  const messageWeight = statusTone === 'info' || statusTone === 'warning' ? 500 : 400;

  // ------------------------------------------------------------------
  // Recent chain display (last 8 moves inline)
  // ------------------------------------------------------------------

  const recentChainText = history
    .slice(-8)
    .map((h) => {
      const display = h.board.map((c) => (c === SPACE ? '·' : c)).join('');
      if (h.initial) return `${display} (start)`;
      return `${display} +${h.points}${h.hinted ? '*' : ''}`;
    })
    .join('  →  ');

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

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
          alignItems: 'flex-start',
          marginBottom: '1rem',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: '22px', fontWeight: 500, letterSpacing: '0.02em' }}>
            Gapplet
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gapplet-muted)', marginTop: '2px' }}>
            Seed: {startSeed}
          </div>
        </div>
        <Stats
          timeLeft={timeLeft}
          score={score}
          chain={chain}
          timerStarted={timerStarted}
          neighborCount={import.meta.env.DEV ? unusedNeighborCount : undefined}
        />
      </div>

      <Board
        board={board}
        lastCommittedBoard={history[history.length - 1].board}
        selectedIdx={selectedIdx}
        hintedIdx={pendingHint?.changedIdx ?? null}
        idle={!timerStarted && !gameOver}
        onCellClick={(i) => {
          if (gameOver) return;
          setSelectedIdx(i);
          maybeStartClock();
        }}
      />

      <Controls
        onSubmit={attemptSubmit}
        onRestore={restoreBoard}
        restoreButtonDisabled={
          gameOver || countDiffs(history[history.length - 1].board, board) === 0
        }
        onInsertSpace={insertSpace}
        onRemoveLetter={removeLetter}
        removeButtonDisabled={
          gameOver || selectedIdx == null || board[selectedIdx] === SPACE
        }
        onBuyHint={buyHint}
        onReset={resetGame}
        hintButtonLabel={hintButtonLabel}
        hintButtonDisabled={hintButtonDisabled}
        gameOver={gameOver}
      />

      <div
        style={{
          minHeight: '22px',
          fontSize: '14px',
          margin: '6px 0 1rem',
          color: messageColor,
          fontWeight: messageWeight,
        }}
      >
        {statusMessage}
      </div>

      <div
        style={{
          background: 'rgba(0, 0, 0, 0.04)',
          borderRadius: '6px',
          padding: '10px 14px',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            color: 'var(--gapplet-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '6px',
          }}
        >
          How to play
        </div>
        <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
          Each move: swap a letter, toggle a space, or <strong>remove</strong> a letter
          (the rest shifts left, a trailing space appears). The result must be a valid
          5-letter word, a 4-letter word with a space at either end, or two valid words
          split by an interior space. Rare letters score more. Each good move adds 0.2
          to your chain; invalid moves or repeats reset it to ×1.0.{' '}
          <strong>Buy a guess</strong>: one hint per minute of play, no stacking.
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--gapplet-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '6px',
          }}
        >
          Recent chain
        </div>
        <div
          style={{
            fontSize: '13px',
            fontFamily: 'monospace',
            lineHeight: 1.8,
            minHeight: '22px',
          }}
        >
          {recentChainText}
        </div>
      </div>

      {gameOver && <GameOver history={history} score={score} startSeed={startSeed} />}
    </div>
  );
}
