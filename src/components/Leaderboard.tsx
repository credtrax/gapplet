import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type LeaderboardRow = {
  id: number;
  user_id: string;
  final_score: number;
  chain_peak: number;
  move_count: number;
  hint_count: number;
  display_name: string;
  avatar_url: string | null;
};

type Props = {
  seedDate: string;
  isHardMode: boolean;
  /** Bump this (pass a changing value) to force a re-fetch. Used to refresh
   *  after the local player's score submission succeeds. */
  refreshKey?: unknown;
};

/**
 * Daily leaderboard for a given UTC date. Shows the top 20 scores. If the
 * signed-in user is outside the top 20, their row appears separately at
 * the bottom with its true rank. The user's row is highlighted in all
 * placements.
 *
 * Two-query design:
 *   1. Top 20 from `daily_leaderboard` view (inherits games RLS — public).
 *   2. If user is signed in and NOT in top 20, one `games` count query
 *      with `gt('final_score', mine.final_score)` gives the overflow rank.
 */
export function Leaderboard({ seedDate, isHardMode, refreshKey }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [myRow, setMyRow] = useState<LeaderboardRow | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      const top = await supabase
        .from('daily_leaderboard')
        .select(
          'id, user_id, final_score, chain_peak, move_count, hint_count, display_name, avatar_url'
        )
        .eq('seed_date', seedDate)
        .eq('hard_mode', isHardMode)
        .limit(20);
      if (cancelled) return;
      if (top.error) {
        setErr(top.error.message);
        setLoading(false);
        return;
      }
      const topRows = (top.data ?? []) as LeaderboardRow[];
      setRows(topRows);

      // Overflow row: if the signed-in user isn't in the top 20, fetch
      // their single row + compute strict rank by counting higher scores.
      if (user) {
        const inTop = topRows.some((r) => r.user_id === user.id);
        if (inTop) {
          setMyRow(null);
          setMyRank(null);
        } else {
          const mine = await supabase
            .from('daily_leaderboard')
            .select(
              'id, user_id, final_score, chain_peak, move_count, hint_count, display_name, avatar_url'
            )
            .eq('seed_date', seedDate)
            .eq('hard_mode', isHardMode)
            .eq('user_id', user.id)
            .maybeSingle();
          if (cancelled) return;
          if (mine.data) {
            const row = mine.data as LeaderboardRow;
            setMyRow(row);
            const higher = await supabase
              .from('games')
              .select('*', { count: 'exact', head: true })
              .eq('seed_date', seedDate)
              .eq('hard_mode', isHardMode)
              .gt('final_score', row.final_score);
            if (cancelled) return;
            setMyRank((higher.count ?? 0) + 1);
          } else {
            setMyRow(null);
            setMyRank(null);
          }
        }
      } else {
        setMyRow(null);
        setMyRank(null);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [seedDate, isHardMode, user?.id, refreshKey]);

  return (
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
        Today's leaderboard {isHardMode ? '(hard)' : ''}
      </div>
      {loading && (
        <div style={{ fontSize: '13px', color: 'var(--gapplet-muted)' }}>
          Loading…
        </div>
      )}
      {err && (
        <div style={{ fontSize: '13px', color: 'var(--gapplet-danger)' }}>
          Failed to load leaderboard: {err}
        </div>
      )}
      {!loading && !err && rows && rows.length === 0 && (
        <div style={{ fontSize: '13px', color: 'var(--gapplet-muted)' }}>
          No scores yet for today. Be first.
        </div>
      )}
      {!loading && !err && rows && rows.length > 0 && (
        <div style={{ fontSize: '13px', fontFamily: 'monospace', lineHeight: 1.6 }}>
          {rows.map((r, i) => (
            <LeaderboardRowView
              key={r.id}
              rank={i + 1}
              row={r}
              isMe={user?.id === r.user_id}
            />
          ))}
          {myRow && myRank != null && (
            <>
              <div
                style={{
                  color: 'var(--gapplet-muted)',
                  padding: '4px 6px',
                  textAlign: 'center',
                }}
              >
                ⋮
              </div>
              <LeaderboardRowView rank={myRank} row={myRow} isMe={true} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LeaderboardRowView({
  rank,
  row,
  isMe,
}: {
  rank: number;
  row: LeaderboardRow;
  isMe: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        padding: '3px 6px',
        borderRadius: '4px',
        background: isMe ? 'rgba(5, 150, 105, 0.12)' : undefined,
        fontWeight: isMe ? 600 : 400,
        alignItems: 'baseline',
      }}
    >
      <span style={{ minWidth: '32px', color: 'var(--gapplet-muted)' }}>
        #{rank}
      </span>
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {row.display_name}
        {isMe && (
          <span style={{ color: 'var(--gapplet-success)', marginLeft: '6px' }}>
            you
          </span>
        )}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.final_score}</span>
      <span
        style={{
          color: 'var(--gapplet-muted)',
          minWidth: '44px',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        ×{row.chain_peak.toFixed(1)}
      </span>
    </div>
  );
}
