/**
 * validate-score — Supabase Edge Function (Deno runtime).
 *
 * The only writer into public.games. Clients cannot INSERT directly (RLS
 * denies it); they POST their move history here, this function replays
 * every move against the authoritative daily seed using the shared game
 * logic, computes the canonical score, and writes the row via
 * service_role. Any replay failure → no row inserted → no cheated score.
 *
 * Non-goals:
 *  - Timer enforcement. The function validates scoring math, not the
 *    2-minute wall clock. A player who takes 10 real minutes and submits
 *    a legitimate-looking move log will pass. Mitigating that needs
 *    server-driven timing (WebSocket or checkpointing) — future work.
 *
 * Request (POST, Authorization: Bearer <user JWT>):
 *   {
 *     seed_date: "YYYY-MM-DD",
 *     hard_mode: boolean,
 *     moves: [
 *       { board: string[5], hinted: boolean, minuteUsed: 1|2|null, restructured: boolean },
 *       ...
 *     ]
 *   }
 *
 * Response (200 on success, 4xx on validation failure, 5xx on infra error):
 *   success: { ok: true, game_id, final_score, chain_peak, hint_count, move_count }
 *   failure: { ok: false, error: string, failed_at_move?: number }
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  validateBoard,
  countDiffs,
  boardKey,
  advanceChain,
  doubleChain,
  createdInteriorSplit,
  scoreMove,
  scoreHintedMove,
  CHAIN_START,
  type Board,
} from '../../../src/lib/game.ts';
import { SPACE } from '../../../src/lib/letterValues.ts';
import { pickSeedForDate, utcDateString } from '../../../src/lib/seeds.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type MoveSubmission = {
  board: string[];
  hinted: boolean;
  minuteUsed: 1 | 2 | null;
  restructured: boolean;
};

type ValidateRequest = {
  seed_date: string;
  hard_mode: boolean;
  moves: MoveSubmission[];
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function err(status: number, reason: string, failed_at_move?: number): Response {
  return json({ ok: false, error: reason, failed_at_move }, status);
}

/**
 * If `curr` is the Remove-shift of `prev` (prefix preserved, suffix shifted
 * left, trailing space added), return the index that was removed. Else null.
 * Used so clients don't need to tag Remove moves explicitly — the board shape
 * is deterministic enough to identify.
 */
function detectRemoveIdx(prev: Board, curr: Board): number | null {
  if (curr[4] !== SPACE) return null;
  for (let k = 0; k < 5; k++) {
    if (prev[k] === SPACE) continue;
    let match = true;
    for (let i = 0; i < k && match; i++) {
      if (prev[i] !== curr[i]) match = false;
    }
    for (let i = k; i < 4 && match; i++) {
      if (prev[i + 1] !== curr[i]) match = false;
    }
    if (match) return k;
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return err(405, 'POST required');
  }

  // --- Auth: extract user from the caller's JWT --------------------------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return err(401, 'missing Authorization header');
  }
  const jwt = authHeader.slice('Bearer '.length);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return err(500, 'server misconfigured: missing env vars');
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return err(401, 'invalid auth token');
  }
  const userId = userData.user.id;

  // --- Parse body --------------------------------------------------------
  let body: ValidateRequest;
  try {
    body = await req.json();
  } catch {
    return err(400, 'invalid JSON body');
  }
  if (
    typeof body.seed_date !== 'string' ||
    typeof body.hard_mode !== 'boolean' ||
    !Array.isArray(body.moves)
  ) {
    return err(400, 'missing or malformed required fields');
  }
  if (body.moves.length === 0) {
    return err(400, 'no moves submitted');
  }
  if (body.moves.length > 500) {
    // Pathological defense. Real games have <50 moves.
    return err(400, 'too many moves');
  }

  // --- Date sanity: today or yesterday (handles midnight edge) ----------
  const today = utcDateString();
  const yesterday = utcDateString(new Date(Date.now() - 86_400_000));
  if (body.seed_date !== today && body.seed_date !== yesterday) {
    return err(400, 'seed_date must be today or yesterday (UTC)');
  }

  // --- Replay ------------------------------------------------------------
  const seed = pickSeedForDate(body.seed_date);
  let board: Board = seed.split('');
  let chain = CHAIN_START;
  let score = 0;
  let chainPeak = CHAIN_START;
  let hintCount = 0;
  const hintsByWindow: { 1: number; 2: number } = { 1: 0, 2: 0 };
  const seenConfigs = new Set<string>([boardKey(board)]);

  for (let i = 0; i < body.moves.length; i++) {
    const m = body.moves[i];

    // Shape checks
    if (!Array.isArray(m.board) || m.board.length !== 5) {
      return err(400, `move ${i}: board must have 5 cells`, i);
    }
    for (const c of m.board) {
      if (c !== SPACE && !/^[A-Z]$/.test(c)) {
        return err(400, `move ${i}: invalid cell "${c}"`, i);
      }
    }

    // --- Restructured (Restart Chain) ---
    if (m.restructured) {
      if (m.hinted) return err(400, `move ${i}: restructured cannot be hinted`, i);
      if (m.board.join('') !== seed) {
        return err(400, `move ${i}: restructured must return to seed`, i);
      }
      board = seed.split('');
      chain = CHAIN_START;
      // Don't add seed to seenConfigs again (already present from init).
      continue;
    }

    // --- Normal or hinted move ---
    const diffs = countDiffs(board, m.board);
    if (diffs === 0) {
      return err(400, `move ${i}: no change from previous board`, i);
    }

    let changedIdx: number | null = null;
    if (diffs === 1) {
      changedIdx = [0, 1, 2, 3, 4].find((k) => board[k] !== m.board[k]) ?? null;
    } else {
      // Must be a Remove-shift pattern. Hints never Remove-shift.
      if (m.hinted) {
        return err(400, `move ${i}: hinted move changed >1 cell`, i);
      }
      const removeIdx = detectRemoveIdx(board, m.board);
      if (removeIdx === null) {
        return err(400, `move ${i}: changed ${diffs} cells, not a valid Remove`, i);
      }
    }

    // Validate word(s)
    const v = validateBoard(m.board);
    if (!v.ok) return err(400, `move ${i}: ${v.reason}`, i);

    // No repeats
    const key = boardKey(m.board);
    if (seenConfigs.has(key)) {
      return err(400, `move ${i}: configuration already played`, i);
    }

    // Scoring + chain update
    let earned: number;
    let newChain: number;
    if (m.hinted) {
      if (m.minuteUsed !== 1 && m.minuteUsed !== 2) {
        return err(400, `move ${i}: hinted move requires minuteUsed (1 or 2)`, i);
      }
      if (hintsByWindow[m.minuteUsed] >= 1) {
        return err(400, `move ${i}: hint budget exhausted for minute ${m.minuteUsed}`, i);
      }
      // Defense-in-depth: hints must not create interior splits. The client
      // hint filter should already exclude those — reject if it didn't.
      if (createdInteriorSplit(board, m.board)) {
        return err(400, `move ${i}: hinted moves cannot create interior space splits`, i);
      }
      // Infer placed letter from the single-cell change (hints are always 1-cell).
      const placedChar = m.board[changedIdx!];
      earned = scoreHintedMove(m.board, chain, placedChar);
      newChain = chain; // hints don't advance chain
      hintsByWindow[m.minuteUsed]++;
      hintCount++;
    } else if (createdInteriorSplit(board, m.board)) {
      // Star move: interior space created — chain doubles, no cap.
      newChain = doubleChain(chain);
      earned = scoreMove(m.board, newChain);
    } else {
      newChain = advanceChain(chain);
      earned = scoreMove(m.board, newChain);
    }

    score += earned;
    if (newChain > chainPeak) chainPeak = newChain;
    chain = newChain;
    seenConfigs.add(key);
    board = m.board.slice();
  }

  // --- Insert via service_role (bypasses RLS; that's the whole point) ---
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: inserted, error: insertErr } = await adminClient
    .from('games')
    .insert({
      user_id: userId,
      seed_date: body.seed_date,
      seed_word: seed,
      moves: body.moves as unknown as any,
      final_score: score,
      chain_peak: chainPeak,
      hint_count: hintCount,
      move_count: body.moves.length,
      hard_mode: body.hard_mode,
    })
    .select('id')
    .single();

  if (insertErr) {
    // 23505 = unique_violation; our (user_id, seed_date, hard_mode) constraint
    if ((insertErr as any).code === '23505') {
      return err(409, 'already submitted a score for this date and mode');
    }
    return err(500, `insert failed: ${insertErr.message}`);
  }

  return json({
    ok: true,
    game_id: inserted!.id,
    final_score: score,
    chain_peak: chainPeak,
    hint_count: hintCount,
    move_count: body.moves.length,
  });
});
