import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Board } from './components/Board';
import { Stats } from './components/Stats';
import { GameOver } from './components/GameOver';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import { AuthButton } from './components/AuthButton';
import { HowToPlay } from './components/HowToPlay';
import { pickSeed, pickSeedForDate, utcDateString } from './lib/seeds';
import { useAuth } from './lib/auth';
import { supabase } from './lib/supabase';
import {
  validateBoard,
  findNeighbors,
  boardKey,
  advanceChain,
  doubleChain,
  createdInteriorSplit,
  scoreMove,
  scoreHintedMove,
  CHAIN_START,
  type Board as BoardType,
  type Neighbor,
} from './lib/game';
import { LETTER_VALUES, SPACE } from './lib/letterValues';
import { DragProvider, type DragSource } from './lib/drag';

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
  /**
   * True if this entry represents the player bailing out of a dead-end by
   * hitting "Restart Chain" — board reverts to the seed, chain resets, but
   * seenConfigs retain the previous path so it can't be re-walked.
   */
  restructured?: boolean;
  /** Chain multiplier after this move was committed. */
  chainAfter: number;
};

type HintsByWindow = { 1: number; 2: number };
type MessageTone = 'info' | 'success' | 'warning' | 'danger' | null;

function initGame(): { seed: string; seedDate: string; isPractice: boolean } {
  const isPractice =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('practice');
  const seedDate = utcDateString();
  const seed = isPractice ? pickSeed() : pickSeedForDate(seedDate);
  return { seed, seedDate, isPractice };
}

type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | {
      status: 'succeeded';
      gameId: number;
      finalScore: number;
      chainPeak: number;
    }
  | { status: 'failed'; error: string }
  | { status: 'duplicate' }
  | { status: 'unauthenticated' }
  | { status: 'practice' };

export function App() {
  // --- Core game state ---
  const [{ seed: startSeed, seedDate: startSeedDate, isPractice: isPracticeMode }] =
    useState(initGame);
  const [board, setBoard] = useState<BoardType>(() => startSeed.split(''));
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
      chainAfter: CHAIN_START,
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
  // selectedIdx still exists for the tap-fallback path: tap a cell, then
  // tap a letter / Backspace / Space to commit a move on that cell. The
  // drag path bypasses selectedIdx entirely — drops know their own target.
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // --- Hint budget ---
  const [hintsByWindow, setHintsByWindow] = useState<HintsByWindow>({ 1: 0, 2: 0 });

  // --- Status line ---
  const [statusMessage, setStatusMessage] = useState<string>(
    'Ready — drag a tile, or tap a cell, to start.'
  );
  const [statusTone, setStatusTone] = useState<MessageTone>('info');

  // --- End-of-game score submission ---
  const { session } = useAuth();
  const [submission, setSubmission] = useState<SubmissionState>({ status: 'idle' });

  // --- How-to-play tutorial ---
  const [showHowTo, setShowHowTo] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('gapplet:seen-howto');
    } catch {
      return false;
    }
  });
  const closeHowTo = () => {
    setShowHowTo(false);
    try {
      localStorage.setItem('gapplet:seen-howto', '1');
    } catch {
      /* private-mode storage disabled — fine, they'll re-see the tutorial */
    }
  };

  // ------------------------------------------------------------------
  // Derived helpers
  // ------------------------------------------------------------------

  const currentWindow = (): 1 | 2 => (timeLeft > 60 ? 1 : 2);
  const hintsLeftInWindow = (): number => (hintsByWindow[currentWindow()] > 0 ? 0 : 1);

  // ------------------------------------------------------------------
  // Score submission on game-end
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!gameOver) return;
    if (submission.status !== 'idle') return;

    if (isPracticeMode) {
      setSubmission({ status: 'practice' });
      return;
    }
    if (!session) {
      setSubmission({ status: 'unauthenticated' });
      return;
    }

    const moves = history.slice(1).map((h) => ({
      board: h.board,
      hinted: h.hinted,
      minuteUsed: h.minuteUsed as 1 | 2 | null,
      restructured: h.restructured ?? false,
    }));
    if (moves.length === 0) return;

    setSubmission({ status: 'submitting' });

    (async () => {
      try {
        const accessToken = session.access_token;
        const result = await supabase.functions.invoke('validate-score', {
          body: { seed_date: startSeedDate, hard_mode: false, moves },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (result.error) {
          const ctx = (result.error as { context?: Response }).context;
          let bodyText = '';
          let body: { ok?: boolean; error?: string; code?: string; message?: string } | null = null;
          if (ctx && typeof ctx.clone === 'function') {
            try {
              bodyText = await ctx.clone().text();
              try {
                body = JSON.parse(bodyText);
              } catch {
                /* not JSON */
              }
            } catch {
              /* couldn't read */
            }
          }
          console.error(
            'validate-score error:\n' +
              JSON.stringify(
                {
                  status: ctx?.status,
                  statusText: ctx?.statusText,
                  bodyText,
                  bodyParsed: body,
                  rawMessage: result.error.message,
                },
                null,
                2
              )
          );
          const serverMsg = body?.error ?? body?.message ?? result.error.message ?? 'submission failed';
          if (body?.error && /already submitted/i.test(body.error)) {
            setSubmission({ status: 'duplicate' });
          } else {
            setSubmission({ status: 'failed', error: serverMsg });
          }
          return;
        }

        const d = result.data as
          | { ok: true; game_id: number; final_score: number; chain_peak: number }
          | { ok: false; error: string };
        if (!d.ok) {
          if (/already submitted/i.test(d.error)) {
            setSubmission({ status: 'duplicate' });
          } else {
            setSubmission({ status: 'failed', error: d.error });
          }
          return;
        }
        setSubmission({
          status: 'succeeded',
          gameId: d.game_id,
          finalScore: d.final_score,
          chainPeak: d.chain_peak,
        });
      } catch (e) {
        console.error('validate-score threw:', e);
        setSubmission({
          status: 'failed',
          error: (e as Error).message ?? 'submission failed',
        });
      }
    })();
  }, [gameOver, submission.status, isPracticeMode, session, history, startSeedDate]);

  useEffect(() => {
    if (session && submission.status === 'unauthenticated') {
      setSubmission({ status: 'idle' });
    }
  }, [session, submission.status]);

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

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  const maybeStartClock = () => {
    if (!timerStarted && !gameOver) {
      setTimerStarted(true);
      setStatusMessage('Clock running. Drag a tile onto the board.');
      setStatusTone(null);
      startTimer();
    }
  };

  // ------------------------------------------------------------------
  // Move commit — the single funnel for both drag and tap-fallback paths.
  // ------------------------------------------------------------------

  /**
   * Attempt to commit nextBoard as a move. The caller has already
   * decided exactly what the new board state should be (no "dirty"
   * intermediate state). This either commits cleanly or rejects with a
   * status message and (where appropriate) a chain reset.
   *
   * opts.hint: present iff this came from Buy Guess. Uses the hinted
   *   scoring formula, holds the chain instead of advancing, and tags
   *   the history entry as hinted.
   */
  const attemptCommit = (nextBoard: BoardType, opts?: { hint?: Neighbor }) => {
    if (gameOver) return;
    maybeStartClock();

    const prev = history[history.length - 1].board;

    // No-op: drop landed somewhere that produced no change (e.g., letter
    // dropped on a cell that already has it). Don't break the chain.
    if (boardKey(nextBoard) === boardKey(prev)) {
      setStatusMessage('No change.');
      setStatusTone('info');
      return;
    }

    const v = validateBoard(nextBoard);
    if (!v.ok) {
      setStatusMessage(`${v.reason}. Chain broken.`);
      setStatusTone('danger');
      setChain(CHAIN_START);
      setSelectedIdx(null);
      return;
    }
    const key = boardKey(nextBoard);
    if (seenConfigs.has(key)) {
      setStatusMessage('Already played that exact configuration. Chain broken.');
      setStatusTone('danger');
      setChain(CHAIN_START);
      setSelectedIdx(null);
      return;
    }

    let earned: number;
    let newChain: number;

    if (opts?.hint) {
      earned = scoreHintedMove(nextBoard, chain, opts.hint.placedChar);
      newChain = chain;
      const placedVal =
        opts.hint.placedChar === SPACE ? 0 : (LETTER_VALUES[opts.hint.placedChar] ?? 0);
      setStatusMessage(
        `Hint used: ${v.words.join(' + ')} • board ${chain.toFixed(1)}× − ${placedVal} = +${earned} (chain held)`
      );
      setStatusTone('warning');
    } else if (createdInteriorSplit(prev, nextBoard)) {
      newChain = doubleChain(chain);
      earned = scoreMove(nextBoard, newChain);
      setStatusMessage(
        `★ Star move: ${v.words.join(' + ')} • chain doubled to ${newChain.toFixed(1)}× = +${earned}`
      );
      setStatusTone('success');
    } else {
      newChain = advanceChain(chain);
      earned = scoreMove(nextBoard, newChain);
      setStatusMessage(
        `Good: ${v.words.join(' + ')} • ${newChain.toFixed(1)}× = +${earned}`
      );
      setStatusTone('success');
    }

    setScore((s) => s + earned);
    setChain(newChain);
    setBoard(nextBoard.slice());
    setSeenConfigs((p) => new Set(p).add(key));
    setHistory((p) => [
      ...p,
      {
        board: nextBoard.slice(),
        words: v.words,
        points: earned,
        initial: false,
        hinted: !!opts?.hint,
        minuteUsed: opts?.hint ? currentWindow() : null,
        chainAfter: newChain,
      },
    ]);
    setSelectedIdx(null);
  };

  // ------------------------------------------------------------------
  // Restart Chain
  // ------------------------------------------------------------------

  const HARD_MODE = false; // TODO: wire to a real setting once hard mode lands
  const restartChain = () => {
    if (gameOver) return;
    if (HARD_MODE) return;
    if (history[history.length - 1].board.join('') === startSeed) return;
    const seedBoard = startSeed.split('');
    setBoard(seedBoard);
    setChain(CHAIN_START);
    setHistory((prev) => [
      ...prev,
      {
        board: seedBoard.slice(),
        words: [startSeed],
        points: 0,
        initial: false,
        hinted: false,
        minuteUsed: null,
        restructured: true,
        chainAfter: CHAIN_START,
      },
    ]);
    setSelectedIdx(null);
    setStatusMessage(
      `Back to ${startSeed}. Chain reset to ×1.0. Previous path stays blocked — find a new first move.`
    );
    setStatusTone('warning');
  };

  // ------------------------------------------------------------------
  // Buy Guess — pre-places a legal letter and auto-commits as hinted.
  // ------------------------------------------------------------------

  const buyHint = () => {
    if (gameOver) return;
    if (!timerStarted) {
      setStatusMessage('Tap a cell or drag a tile first to start the clock.');
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
    // Hints may not create interior-space splits — those are star-move
    // territory for the player to find.
    const usable = neighbors.filter(
      (n) => !seenConfigs.has(boardKey(n.board)) && !createdInteriorSplit(current, n.board)
    );
    if (usable.length === 0) {
      setStatusMessage('No legal non-star moves from this position. Try restructuring.');
      setStatusTone('danger');
      return;
    }
    setHintsByWindow((h) => ({ ...h, [currentWindow()]: 1 }));
    const choice = usable[Math.floor(Math.random() * usable.length)];
    attemptCommit(choice.board, { hint: choice });
  };

  // ------------------------------------------------------------------
  // Drop handler — every drag gesture funnels through here.
  // ------------------------------------------------------------------

  const handleDrop = (source: DragSource, targetIdx: number | null) => {
    if (gameOver) return;
    if (targetIdx == null) return; // released off any cell — silent no-op
    const prev = history[history.length - 1].board;

    if (source.kind === 'letter') {
      const next = prev.slice();
      next[targetIdx] = source.letter;
      attemptCommit(next);
      return;
    }

    if (source.kind === 'space') {
      const next = prev.slice();
      next[targetIdx] = SPACE;
      attemptCommit(next);
      return;
    }

    if (source.kind === 'backspace') {
      // Same shift-collapse semantics as the old Backspace: remove the
      // letter (or space) at targetIdx, shift everything to its right one
      // position left, trailing space added at index 4.
      if (targetIdx === 4 && prev[4] === SPACE) {
        setStatusMessage("That's already the trailing space — nothing would shift.");
        setStatusTone('info');
        return;
      }
      const next = [
        ...prev.slice(0, targetIdx),
        ...prev.slice(targetIdx + 1),
        SPACE,
      ];
      attemptCommit(next);
      return;
    }

    if (source.kind === 'board-cell') {
      // Swap source.idx with targetIdx. Same-cell drop is a no-op.
      if (source.idx === targetIdx) return;
      const next = prev.slice();
      [next[source.idx], next[targetIdx]] = [next[targetIdx], next[source.idx]];
      attemptCommit(next);
      return;
    }
  };

  // ------------------------------------------------------------------
  // Hint button label
  // ------------------------------------------------------------------

  const hintButtonDisabled = gameOver || (timerStarted && hintsLeftInWindow() <= 0);

  const hintLabel = (() => {
    if (gameOver) return 'Buy Guess';
    if (!timerStarted) return 'Buy Guess';
    if (hintsLeftInWindow() > 0) return 'Buy Guess';
    if (currentWindow() === 1) {
      const wait = Math.max(0, timeLeft - 60);
      const m = Math.floor(wait / 60);
      const s = wait % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    }
    return 'No hints';
  })();

  // ------------------------------------------------------------------
  // Status line styling
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
    <DragProvider onDrop={handleDrop}>
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
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <Stats
              timeLeft={timeLeft}
              score={score}
              chain={chain}
              timerStarted={timerStarted}
              neighborCount={unusedNeighborCount}
              hardMode={false /* TODO: wire to real hard-mode setting (task #22) */}
            />
            <button
              onClick={() => setShowHowTo(true)}
              aria-label="How to play"
              title="How to play"
              style={{
                fontSize: '14px',
                padding: '0.35rem 0.6rem',
                fontWeight: 600,
              }}
            >
              ?
            </button>
            <AuthButton />
          </div>
        </div>

        <Board
          board={board}
          selectedIdx={selectedIdx}
          idle={!timerStarted && !gameOver}
          onCellClick={(i) => {
            if (gameOver) return;
            setSelectedIdx(i);
            maybeStartClock();
          }}
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

        <VirtualKeyboard
          onLetterKey={(letter) => {
            if (gameOver) return;
            if (selectedIdx == null) {
              setStatusMessage('Tap a cell first, or drag the letter onto a cell.');
              setStatusTone('info');
              return;
            }
            const next = board.slice();
            next[selectedIdx] = letter;
            attemptCommit(next);
          }}
          onBackspace={() => {
            if (gameOver) return;
            if (selectedIdx == null) {
              setStatusMessage('Tap a cell first, or drag ⌫ onto the cell to remove.');
              setStatusTone('info');
              return;
            }
            handleDrop({ kind: 'backspace' }, selectedIdx);
          }}
          onSpace={() => {
            if (gameOver) return;
            if (selectedIdx == null) {
              setStatusMessage('Tap a cell first, or drag Space onto the cell.');
              setStatusTone('info');
              return;
            }
            handleDrop({ kind: 'space' }, selectedIdx);
          }}
          onRestartChain={restartChain}
          onBuyHint={buyHint}
          letterKeyDisabled={gameOver}
          backspaceDisabled={gameOver}
          spaceDisabled={gameOver}
          restartChainDisabled={
            gameOver || HARD_MODE ||
            history[history.length - 1].board.join('') === startSeed
          }
          hintDisabled={hintButtonDisabled}
          hintLabel={hintLabel}
        />

        <div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--gapplet-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginTop: '1rem',
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

        {gameOver && (
          <GameOver
            history={history}
            score={score}
            startSeed={startSeed}
            seedDate={startSeedDate}
            submission={submission}
          />
        )}
        {showHowTo && <HowToPlay onClose={closeHowTo} />}
      </div>
    </DragProvider>
  );
}
