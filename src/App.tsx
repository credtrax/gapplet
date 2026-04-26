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
  CHAIN_START,
  type Board as BoardType,
  type Neighbor,
} from './lib/game';
import { SPACE } from './lib/letterValues';
import { DragProvider, type DragSource, type DropTarget } from './lib/drag';
import { ActivityBox, type ActivityEvent } from './components/ActivityBox';

const GAME_DURATION_SECONDS = 120;

/** A single entry in the move history. */
export type HistoryEntry = {
  board: BoardType;
  words: string[];
  points: number;
  initial: boolean;
  hinted: boolean;
  minuteUsed: number | null;
  restructured?: boolean;
  chainAfter: number;
};

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

const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Score points needed to earn one Buy Guess charge. */
const POINTS_PER_HINT = 100;

/** Seconds of inactivity before the Eliminate tool unlocks. */
const ELIMINATE_IDLE_SECONDS = 10;

/** Moves scoring at least this many points award a clock bonus. */
const TIME_BONUS_THRESHOLD = 15;
/** Seconds added to the clock for each qualifying move. */
const TIME_BONUS_SECONDS = 2;

/** Format an integer seconds count as +M:SS (zero-padded seconds).
 * Used for the "+0:02" clock-bonus indicator in messages and celebrations. */
function fmtBonus(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, '0');
  return `+${mm}:${ss}`;
}

/** Clock seconds deducted when a player attempts a blocklisted word. */
const SOAP_PENALTY_SECONDS = 5;

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

  // --- Tool: Buy Guess (score-gated charges) ---
  // Charges earned = floor(score / POINTS_PER_HINT). hintsUsed tracks how
  // many have been spent, so available = earned − used. Score is monotone
  // non-decreasing, so charges never lock back down once earned.
  const [hintsUsed, setHintsUsed] = useState(0);

  // --- Tool: Eliminate Useless Letters (idle-gated, costs chain) ---
  // idleSeconds increments via the 1 Hz timer interval and resets on every
  // commit attempt (success or fail). Available when idleSeconds ≥
  // ELIMINATE_IDLE_SECONDS and not already active. eliminateActive flips
  // true when the tool is pressed; it clears on the next successful commit.
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [eliminateActive, setEliminateActive] = useState(false);

  // Count of blocklisted-word attempts. Used by the share emit to display
  // a soap emoji per offense (handled in a follow-up commit).
  const [soapPenalties, setSoapPenalties] = useState(0);

  // Active soap-penalty lockout in seconds. Decremented by the 1 Hz timer
  // alongside timeLeft / idleSeconds. While > 0, all input is suspended
  // (drags, taps, tool buttons) and the activity panel renders the
  // soap-and-bubbles UI with the live countdown. Game timer keeps running
  // during the lockout — the natural time loss IS the penalty.
  const [soapPenaltyRemaining, setSoapPenaltyRemaining] = useState(0);
  const inputBlocked = gameOver || soapPenaltyRemaining > 0;

  // Most recent commit's animation payload. ActivityBox keys its
  // children off `id`, so each new event re-mounts the children and
  // re-runs their CSS keyframes. eventIdRef gives us a monotonic ID
  // without forcing a render dependency.
  const [activityEvent, setActivityEvent] = useState<ActivityEvent | null>(null);
  const eventIdRef = useRef(0);

  // --- Status line ---
  const [statusMessage, setStatusMessage] = useState<string>(
    'Ready — drag a tile, or tap a cell, to start.'
  );
  const [statusTone, setStatusTone] = useState<MessageTone>('info');

  // --- End-of-game score submission ---
  const { session, profile } = useAuth();
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
      /* private-mode storage disabled */
    }
  };

  // ------------------------------------------------------------------
  // Derived helpers
  // ------------------------------------------------------------------

  /** Approximate "which minute" a hinted move was used in. Kept for
   * server-side telemetry compatibility (validate-score reads it). */
  const currentWindow = (): 1 | 2 => (timeLeft > 60 ? 1 : 2);

  const hintsEarned = Math.floor(score / POINTS_PER_HINT);
  const hintsAvailable = Math.max(0, hintsEarned - hintsUsed);
  const hintMeterPercent = ((score % POINTS_PER_HINT) / POINTS_PER_HINT) * 100;
  const eliminateMeterPercent = Math.min(100, (idleSeconds / ELIMINATE_IDLE_SECONDS) * 100);

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

  // Set of unused one-swap neighbors from the current committed board.
  // Drives both the visible "Paths" stat and the Eliminate Useless Letters
  // grey-out (the letters with no entry here are useless).
  const validNeighbors = useMemo(() => {
    if (gameOver) return [];
    const current = history[history.length - 1].board;
    return findNeighbors(current).filter((n) => !seenConfigs.has(boardKey(n.board)));
  }, [history, seenConfigs, gameOver]);

  const unusedNeighborCount = validNeighbors.length;

  /**
   * Letters that, when placed in at least one cell, produce a valid unseen
   * 5-letter word. The complement of this set (within A–Z) is what the
   * Eliminate tool greys out.
   */
  const usefulLetters = useMemo(() => {
    const set = new Set<string>();
    for (const n of validNeighbors) {
      if (n.placedChar === SPACE) continue;
      set.add(n.placedChar);
    }
    return set;
  }, [validNeighbors]);

  const disabledLetters = useMemo(() => {
    if (!eliminateActive) return new Set<string>();
    return new Set(ALL_LETTERS.split('').filter((l) => !usefulLetters.has(l)));
  }, [eliminateActive, usefulLetters]);

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
      // Idle counter ticks alongside the clock. Capped at the unlock
      // threshold so the meter doesn't overflow visually.
      setIdleSeconds((s) => Math.min(ELIMINATE_IDLE_SECONDS, s + 1));
      // Soap-penalty countdown ticks alongside everything else.
      // When it transitions to 0, restore a clean status message so
      // the panel cross-fades back to the regular display.
      setSoapPenaltyRemaining((s) => {
        if (s <= 0) return 0;
        const next = s - 1;
        if (next === 0) {
          setStatusMessage('Cleansed. Carry on.');
          setStatusTone('info');
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
  // Move commit
  // ------------------------------------------------------------------

  /**
   * Attempt to commit nextBoard as a move. Caller has decided exactly what
   * the new board state should be (no dirty intermediate state).
   *
   * opts.hint: hinted commit from Buy Guess. Hint moves don't advance the
   *   chain (the trade for getting a free legal move). They do score the
   *   board fully — the charge cost is paid up front, so per-move scoring
   *   is unmodified.
   */
  const attemptCommit = (nextBoard: BoardType, opts?: { hint?: Neighbor }) => {
    if (inputBlocked) return;
    maybeStartClock();
    // Any commit attempt counts as activity, regardless of outcome.
    setIdleSeconds(0);

    const prev = history[history.length - 1].board;

    if (boardKey(nextBoard) === boardKey(prev)) {
      setStatusMessage('No change.');
      setStatusTone('info');
      return;
    }

    const v = validateBoard(nextBoard);
    if (!v.ok) {
      if (v.blocklisted) {
        // Soap penalty: chain breaks AND input is suspended for
        // SOAP_PENALTY_SECONDS while the countdown runs. The game timer
        // continues to tick down — the natural time loss during the
        // lockout IS the penalty (no separate clock deduction).
        setSoapPenaltyRemaining(SOAP_PENALTY_SECONDS);
        setSoapPenalties((n) => n + 1);
        setChain(CHAIN_START);
        setSelectedIdx(null);
        setStatusMessage(
          `🧼 Naughty Word - chain broken. ${SOAP_PENALTY_SECONDS} second cleansing penalty 🧼`
        );
        setStatusTone('danger');
        return;
      }
      setStatusMessage(`${v.reason}. Chain broken.`);
      setStatusTone('danger');
      setChain(CHAIN_START);
      setSelectedIdx(null);
      return;
    }
    const key = boardKey(nextBoard);
    if (seenConfigs.has(key)) {
      setStatusMessage(`Already played ${v.words.join(' + ')}. Chain broken.`);
      setStatusTone('danger');
      setChain(CHAIN_START);
      setSelectedIdx(null);
      return;
    }

    let earned: number;
    let newChain: number;
    let messageBase: string;
    let tone: MessageTone;
    let isStar = false;

    if (opts?.hint) {
      // Hinted: chain held, board scored normally at the held multiplier.
      // The "cost" is one charge, paid out of the meter (handled in buyHint).
      earned = scoreMove(nextBoard, chain);
      newChain = chain;
      messageBase = `Hint used: ${v.words.join(' + ')} • ${chain.toFixed(1)}× = +${earned} (chain held)`;
      tone = 'warning';
    } else if (createdInteriorSplit(prev, nextBoard)) {
      newChain = doubleChain(chain);
      earned = scoreMove(nextBoard, newChain);
      messageBase = `★ Star move: ${v.words.join(' + ')} • chain doubled to ${newChain.toFixed(1)}× = +${earned}`;
      tone = 'success';
      isStar = true;
    } else {
      newChain = advanceChain(chain);
      earned = scoreMove(nextBoard, newChain);
      messageBase = `Good: ${v.words.join(' + ')} • ${newChain.toFixed(1)}× = +${earned}`;
      tone = 'success';
    }

    // High-scoring moves award a clock bonus. The threshold is post-multiplier,
    // so big chain runs make the bonus near-automatic — that's the point: a
    // positive feedback loop where good play extends the runway.
    const timeBonus = earned >= TIME_BONUS_THRESHOLD ? TIME_BONUS_SECONDS : 0;
    if (timeBonus > 0) {
      setTimeLeft((t) => t + timeBonus);
    }
    setStatusMessage(timeBonus > 0 ? `${messageBase}  ${fmtBonus(timeBonus)}!` : messageBase);
    setStatusTone(tone);

    // Charge-earned detection: did this commit push the score across the
    // next POINTS_PER_HINT boundary? Score is monotone non-decreasing
    // and `earned` is non-negative, so a simple floor comparison suffices.
    const chargeEarned =
      Math.floor((score + earned) / POINTS_PER_HINT) > Math.floor(score / POINTS_PER_HINT);

    eventIdRef.current += 1;
    setActivityEvent({
      id: eventIdRef.current,
      earned,
      isStar,
      isHint: !!opts?.hint,
      multiplier: newChain,
      timeBonus,
      chargeEarned,
    });

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
    // Successful commit consumes the eliminate active state — the grey-out
    // is recomputed for the new board on the next press.
    setEliminateActive(false);
  };

  // ------------------------------------------------------------------
  // Tools
  // ------------------------------------------------------------------

  const HARD_MODE = false;

  const restartChain = () => {
    if (inputBlocked) return;
    if (HARD_MODE) return;
    if (history[history.length - 1].board.join('') === startSeed) return;
    const seedBoard = startSeed.split('');
    setBoard(seedBoard);
    setChain(CHAIN_START);
    setIdleSeconds(0);
    setEliminateActive(false);
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

  const buyHint = () => {
    if (inputBlocked) return;
    if (!timerStarted) {
      setStatusMessage('Tap a cell or drag a tile first to start the clock.');
      setStatusTone('info');
      return;
    }
    if (hintsAvailable <= 0) {
      const need = POINTS_PER_HINT - (score % POINTS_PER_HINT);
      setStatusMessage(`Earn ${need} more point${need === 1 ? '' : 's'} to unlock another hint.`);
      setStatusTone('info');
      return;
    }
    const current = history[history.length - 1].board;
    // Hints may not create interior-space splits — those are star-move
    // territory for the player to find.
    const usable = validNeighbors.filter((n) => !createdInteriorSplit(current, n.board));
    if (usable.length === 0) {
      setStatusMessage('No legal non-star moves from this position. Try restructuring.');
      setStatusTone('danger');
      return;
    }
    setHintsUsed((u) => u + 1);
    const choice = usable[Math.floor(Math.random() * usable.length)];
    attemptCommit(choice.board, { hint: choice });
  };

  const eliminateUseless = () => {
    if (inputBlocked) return;
    if (eliminateActive) return; // already active — wait for next commit
    if (idleSeconds < ELIMINATE_IDLE_SECONDS) {
      const wait = ELIMINATE_IDLE_SECONDS - idleSeconds;
      setStatusMessage(`Wait ${wait} more second${wait === 1 ? '' : 's'} of inactivity to unlock Eliminate.`);
      setStatusTone('info');
      return;
    }
    setEliminateActive(true);
    setChain(CHAIN_START);
    setIdleSeconds(0);
    const culled = 26 - usefulLetters.size;
    setStatusMessage(
      `Eliminate active: ${culled} letter${culled === 1 ? '' : 's'} greyed out. Chain reset to ×1.0.`
    );
    setStatusTone('warning');
  };

  // ------------------------------------------------------------------
  // Drop handler — every drag gesture funnels through here.
  // ------------------------------------------------------------------

  const handleDrop = (source: DragSource, target: DropTarget | null) => {
    if (inputBlocked) return;
    if (target == null) return;
    const prev = history[history.length - 1].board;

    // Gap drops: insert-with-shift, only valid for letter sources, only
    // when there's a space on the board to absorb the shift. Math:
    //   k = index of the existing space
    //   g = gap index (1..4, between cells g-1 and g)
    //   if g <= k: shift cells [g, k-1] right by 1, place letter at g
    //   if g >  k: shift cells [k+1, g-1] left  by 1, place letter at g-1
    // Adjacent-to-space and edge cases reduce to existing cell-drop
    // behavior, which is fine — they end up at the same nextBoard.
    if (target.kind === 'gap') {
      if (source.kind !== 'letter') return;
      if (disabledLetters.has(source.letter)) return;
      const k = prev.indexOf(SPACE);
      if (k < 0) return; // no space to absorb the shift; gap drop is a no-op
      const g = target.idx;
      const next = prev.slice();
      if (g <= k) {
        for (let i = k; i > g; i--) next[i] = next[i - 1];
        next[g] = source.letter;
      } else {
        for (let i = k; i < g - 1; i++) next[i] = next[i + 1];
        next[g - 1] = source.letter;
      }
      attemptCommit(next);
      return;
    }

    // Cell drops: existing replace / remove / set-space / swap semantics.
    const targetIdx = target.idx;

    if (source.kind === 'letter') {
      if (disabledLetters.has(source.letter)) return;
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
      if (source.idx === targetIdx) return;
      const next = prev.slice();
      [next[source.idx], next[targetIdx]] = [next[targetIdx], next[source.idx]];
      attemptCommit(next);
      return;
    }
  };

  // ------------------------------------------------------------------
  // Tool button labels
  // ------------------------------------------------------------------

  const hintButtonDisabled = inputBlocked || hintsAvailable <= 0;
  const hintLabel = hintsAvailable > 0 ? `Buy Guess (${hintsAvailable})` : 'Buy Guess';

  const eliminateButtonDisabled =
    inputBlocked || eliminateActive || idleSeconds < ELIMINATE_IDLE_SECONDS;
  const eliminateLabel = eliminateActive
    ? 'Active'
    : idleSeconds >= ELIMINATE_IDLE_SECONDS
    ? 'Eliminate'
    : 'Eliminate';

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
            <img
              src="/word-nerd-logo.png"
              alt="Joe's Word Nerd"
              style={{ height: '54px', display: 'block' }}
            />
            <div style={{ fontSize: '12px', color: 'var(--gapplet-muted)', marginTop: '4px' }}>
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
              hardMode={false}
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
            if (inputBlocked) return;
            setSelectedIdx(i);
            maybeStartClock();
          }}
        />

        <ActivityBox
          event={activityEvent}
          statusMessage={statusMessage}
          tone={statusTone}
          isReady={!timerStarted && !gameOver}
          timeLeft={timeLeft}
          soapPenaltyRemaining={soapPenaltyRemaining}
          readyTopLine={
            session
              ? profile?.display_name
                ? `Ready for you to start, ${profile.display_name}.`
                : 'Ready for you to start'
              : 'Sign in to save your score to the leaderboard'
          }
        />

        <VirtualKeyboard
          onLetterKey={(letter) => {
            if (inputBlocked) return;
            if (disabledLetters.has(letter)) return;
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
            if (inputBlocked) return;
            if (selectedIdx == null) {
              setStatusMessage('Tap a cell first, or drag ⌫ onto the cell to remove.');
              setStatusTone('info');
              return;
            }
            handleDrop({ kind: 'backspace' }, { kind: 'cell', idx: selectedIdx });
          }}
          onSpace={() => {
            if (inputBlocked) return;
            if (selectedIdx == null) {
              setStatusMessage('Tap a cell first, or drag Space onto the cell.');
              setStatusTone('info');
              return;
            }
            handleDrop({ kind: 'space' }, { kind: 'cell', idx: selectedIdx });
          }}
          onRestartChain={restartChain}
          onBuyHint={buyHint}
          onEliminate={eliminateUseless}
          letterKeyDisabled={inputBlocked}
          backspaceDisabled={inputBlocked}
          spaceDisabled={inputBlocked}
          restartChainDisabled={
            inputBlocked || HARD_MODE ||
            history[history.length - 1].board.join('') === startSeed
          }
          hintDisabled={hintButtonDisabled}
          eliminateDisabled={eliminateButtonDisabled}
          hintLabel={hintLabel}
          eliminateLabel={eliminateLabel}
          hintMeterPercent={hintMeterPercent}
          eliminateMeterPercent={eliminateMeterPercent}
          disabledLetters={disabledLetters}
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
            soapPenalties={soapPenalties}
          />
        )}
        {showHowTo && <HowToPlay onClose={closeHowTo} />}
      </div>
    </DragProvider>
  );
}
