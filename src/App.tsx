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
  countDiffs,
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
   * hitting "Back to start" — board reverts to the seed, chain resets, but
   * seenConfigs retain the previous path so it can't be re-walked.
   */
  restructured?: boolean;
  /**
   * Chain multiplier after this move was committed. Used by the GameOver
   * full-chain display to show the rate at which each score was earned.
   * Not sent to the Edge Function (server recomputes scoring).
   */
  chainAfter: number;
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

/**
 * Lock the game's identity — seed word, the UTC date it's anchored to, and
 * whether it's a practice game — at mount time. All three as a unit because
 * submission back to the server (task #8) needs the exact (seed_date)
 * the player started with, to survive the midnight boundary.
 */
function initGame(): { seed: string; seedDate: string; isPractice: boolean } {
  const isPractice =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('practice');
  const seedDate = utcDateString();
  const seed = isPractice ? pickSeed() : pickSeedForDate(seedDate);
  return { seed, seedDate, isPractice };
}

/**
 * Submission state for the end-of-game leaderboard post. Only the `idle`
 * state triggers a POST; everything else is terminal for this game.
 */
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

  // --- End-of-game score submission ---
  const { session } = useAuth();
  const [submission, setSubmission] = useState<SubmissionState>({ status: 'idle' });

  // --- How-to-play tutorial ---
  // Auto-opens on first visit (localStorage-gated). Reopens anytime via the
  // "?" button in the header.
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

  // ------------------------------------------------------------------
  // Score submission on game-end
  // ------------------------------------------------------------------

  // Main submit effect: fires once on game-end, POSTs moves to the
  // validate-score Edge Function (task #7). Server replays against the
  // authoritative seed and inserts into games via service_role.
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

    // history[0] is the seed marker. Skip it; submit only played entries.
    const moves = history.slice(1).map((h) => ({
      board: h.board,
      hinted: h.hinted,
      minuteUsed: h.minuteUsed as 1 | 2 | null,
      restructured: h.restructured ?? false,
    }));
    if (moves.length === 0) {
      // No actual moves — nothing to post. Stay idle (don't publish an empty game).
      return;
    }

    setSubmission({ status: 'submitting' });

    (async () => {
      try {
        // Explicitly attach the current session JWT so there's no reliance
        // on the invoke() default header behavior. Also mirrors what the
        // Edge Function's `Authorization: Bearer <jwt>` check expects.
        const accessToken = session.access_token;

        const result = await supabase.functions.invoke('validate-score', {
          body: { seed_date: startSeedDate, hard_mode: false, moves },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        // Non-2xx responses: supabase-js wraps them in FunctionsHttpError whose
        // `.context` is the raw Response. Pull the body to surface the server's
        // actual error text ("move 3: …" rather than "non-2xx status").
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
          // Flatten for Safari-friendly console output
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
          // Gateway-level 401 returns { code, message }; function-level returns { ok, error }
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

  // If the player signs in post-game-end, reset to idle so the main effect
  // re-fires and actually submits. Only triggers on the unauthenticated→
  // signed-in transition for this game.
  useEffect(() => {
    if (session && submission.status === 'unauthenticated') {
      setSubmission({ status: 'idle' });
    }
  }, [session, submission.status]);

  /**
   * How many unused one-swap neighbors exist from the last committed board?
   * Visible as the "Paths" stat card in normal mode; hidden behind a
   * muted placeholder in hard mode (task #22). Memoized on history +
   * seenConfigs so it only recomputes after a move, not on every input
   * event. ~135 dict lookups — sub-millisecond.
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
    } else if (createdInteriorSplit(prev, board)) {
      // Star move: interior space created (index 1/2/3). Chain doubles
      // instead of advancing by +0.2.
      newChain = doubleChain(chain);
      earned = scoreMove(board, newChain);
      setStatusMessage(
        `★ Star move: ${v.words.join(' + ')} • chain doubled to ${newChain.toFixed(1)}× = +${earned}`
      );
      setStatusTone('success');
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
        chainAfter: newChain,
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
   * "Revert to last successful word" — undo any uncommitted edits and put
   * the board back to the last successfully-submitted state (or the seed,
   * if no moves yet). Chain, score, history, timer all unchanged. This is
   * the pre-commit safety net for "I clicked wrong." Bound to physical Esc.
   */
  const revertToLastWord = () => {
    if (gameOver) return;
    const lastValid = history[history.length - 1].board;
    if (countDiffs(lastValid, board) === 0) return;
    setBoard(lastValid.slice());
    setSelectedIdx(null);
    setPendingHint(null);
    setPendingRemoveSource(null);
    setStatusMessage('Reverted to the last committed word. Keep going.');
    setStatusTone('info');
  };

  /**
   * "Restart chain" — return the board to the original seed word. Chain
   * resets to ×1.0 as the cost. Previously-played configurations stay in
   * seenConfigs, so the player must find a different path through the
   * word graph — they can't just replay the abandoned chain. Two use cases:
   *   1. Dead-end rescue: current board has no unplayed one-swap neighbors.
   *   2. Strategic branch-switch: player decides their first-move branch
   *      isn't going anywhere good and pays chain to try a different step-1.
   *
   * Disabled when: the committed board is already the seed (nothing to
   * abandon), game is over, or hard mode is active (future HARD_MODE hook).
   * Button-only — no keyboard shortcut, because it's a bigger commitment
   * than Revert. Esc is reserved for Revert.
   */
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
    setPendingHint(null);
    setPendingRemoveSource(null);
    setStatusMessage(
      `Back to ${startSeed}. Chain reset to ×1.0. Previous path stays blocked — find a new first move.`
    );
    setStatusTone('warning');
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
    // Hints may not create interior-space splits — those are star-move
    // territory for the player to find. Prevents hint-farming an interior
    // space (which would freeze chain but set up the board for a later
    // non-hinted interior-split replay — closed off by task #22-era design).
    const usable = neighbors.filter(
      (n) => !seenConfigs.has(boardKey(n.board)) && !createdInteriorSplit(current, n.board)
    );
    if (usable.length === 0) {
      setStatusMessage('No legal non-star moves from this position. Try restructuring.');
      setStatusTone('danger');
      return;
    }
    const unseen = usable;

    // Consume the hint immediately so the player can't repeatedly ask for
    // different hints within the same window.
    setHintsByWindow((h) => ({ ...h, [currentWindow()]: 1 }));

    const choice = unseen[Math.floor(Math.random() * unseen.length)];
    setPendingHint(choice);
    setPendingRemoveSource(null);
    setBoard(choice.board.slice());
    setSelectedIdx(choice.changedIdx);

    // Set a brief placeholder message; attemptSubmit fires via the
    // auto-commit effect below and overwrites it with the real outcome
    // within a render tick. Users never see this line in practice, but
    // it prevents a flash of stale content if React re-renders before
    // the effect runs.
    setStatusMessage(`Playing hint: ${choice.words.join(' + ')}…`);
    setStatusTone('warning');
  };

  // Auto-commit hinted moves: Buy Guess is an explicit paid action, so
  // there's no second-confirmation value in requiring Enter after the
  // board updates. When buyHint flips pendingHint to a Neighbor, fire
  // attemptSubmit on the next render — by which point the board state
  // reflects the placed hint and the closure sees the right values.
  // attemptSubmit clears pendingHint as part of its cleanup; the effect
  // re-fires but short-circuits via the `if (pendingHint)` guard.
  useEffect(() => {
    if (pendingHint) {
      attemptSubmit();
    }
    // attemptSubmit is intentionally omitted from deps — we want this
    // effect to fire only when pendingHint transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHint]);

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
        revertToLastWord();
        return;
      }
      if (e.key === '1') {
        e.preventDefault();
        restartChain();
        return;
      }
      if (e.key === '=') {
        e.preventDefault();
        buyHint();
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

  const hintButtonDisabled =
    gameOver || (timerStarted && hintsLeftInWindow() <= 0);

  /**
   * Label for the Buy Guess key on the virtual keyboard. When a hint is
   * available or the game hasn't started, reads "Buy Guess". When the
   * minute-1 hint has been used and we're still in minute 1, shows the
   * live countdown to when the minute-2 hint unlocks. When both hints are
   * spent, reads "No hints".
   */
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
          if (gameOver || selectedIdx == null) return;
          setPendingHint(null);
          setPendingRemoveSource(null);
          setBoard((prev) => {
            const next = prev.slice();
            next[selectedIdx] = letter;
            return next;
          });
        }}
        onEnter={attemptSubmit}
        onBackspace={removeLetter}
        onSpace={insertSpace}
        onRestartChain={restartChain}
        onRevert={revertToLastWord}
        onBuyHint={buyHint}
        letterKeyDisabled={gameOver || selectedIdx == null}
        enterDisabled={gameOver}
        backspaceDisabled={
          gameOver || selectedIdx == null || board[selectedIdx] === SPACE
        }
        spaceDisabled={gameOver || selectedIdx == null}
        restartChainDisabled={
          gameOver || HARD_MODE ||
          history[history.length - 1].board.join('') === startSeed
        }
        revertDisabled={
          gameOver || countDiffs(history[history.length - 1].board, board) === 0
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
  );
}
