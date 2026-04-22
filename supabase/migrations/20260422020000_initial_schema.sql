-- ============================================================================
-- Gapplet initial schema
-- ============================================================================
-- Two tables — profiles (user-facing data) and games (per-play records) — plus
-- two leaderboard views and triggers to keep things wired up.
--
-- Anti-cheat invariant: clients NEVER insert into games. The Edge Function
-- score-validator (task #7) runs with service_role and writes rows only after
-- replaying the move history against the authoritative daily seed. RLS here
-- encodes that by granting no INSERT/UPDATE/DELETE to anon or authenticated.

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
-- 1:1 with auth.users. Auto-created on signup via the trigger below.

CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Public-readable — leaderboards need display_name + avatar_url for every user
-- who appears on one. No PII in this table by design.
CREATE POLICY "profiles_select_public"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (true);

-- Owners can edit their own row (change display name, swap avatar).
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- No INSERT/DELETE policies — INSERT is handled by the on_auth_user_created
-- trigger; DELETE cascades from auth.users.

-- Keep updated_at honest
CREATE FUNCTION public.tg_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_updated_at();

-- Auto-create profile on signup. Pulls display_name from OAuth metadata —
-- Google uses full_name, GitHub uses user_name, magic-link has neither so we
-- fall back to the email local-part. Final fallback is a literal 'Player'.
--
-- SECURITY DEFINER so it can insert into public.profiles from the context of
-- auth.users inserts. search_path locked to public to prevent search-path
-- attacks.
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'user_name',
      split_part(NEW.email, '@', 1),
      'Player'
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- games
-- ----------------------------------------------------------------------------
-- One row per completed game that counts for the leaderboard. Practice-mode
-- games (random seed, ?practice=1) are not stored at all — they're pure local
-- play with no persistence. The client submits `moves` to the Edge Function;
-- server validates and writes here with service_role.

CREATE TABLE public.games (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seed_date    DATE NOT NULL,
  seed_word    TEXT NOT NULL,
  moves        JSONB NOT NULL CHECK (jsonb_typeof(moves) = 'array'),
  final_score  INT NOT NULL CHECK (final_score >= 0),
  chain_peak   REAL NOT NULL CHECK (chain_peak >= 1.0 AND chain_peak <= 5.0),
  hint_count   SMALLINT NOT NULL DEFAULT 0 CHECK (hint_count >= 0 AND hint_count <= 2),
  move_count   SMALLINT NOT NULL CHECK (move_count >= 0),
  hard_mode    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One game per user per day per mode (normal vs hard). Allows a player to
-- take on both the normal daily AND the hard daily on the same UTC date,
-- but prevents double-submitting either.
CREATE UNIQUE INDEX games_unique_daily_per_mode
  ON public.games (user_id, seed_date, hard_mode);

-- Fast "today's leaderboard" queries: ORDER BY (seed_date, final_score DESC)
CREATE INDEX games_leaderboard_idx
  ON public.games (seed_date, hard_mode, final_score DESC);

-- Fast "this user's history" queries
CREATE INDEX games_user_history_idx
  ON public.games (user_id, created_at DESC);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Everyone can read — leaderboards are public
CREATE POLICY "games_select_public"
  ON public.games FOR SELECT
  TO anon, authenticated
  USING (true);

-- Intentionally NO INSERT/UPDATE/DELETE policies for anon or authenticated.
-- Only service_role (Edge Function) writes here. That's the anti-cheat gate —
-- no client-authored score can reach this table.

-- ----------------------------------------------------------------------------
-- Leaderboard views
-- ----------------------------------------------------------------------------
-- Views inherit underlying-table RLS in Postgres 15+ / Supabase defaults
-- (security_invoker mode). Clients filter/limit client-side, e.g.:
--   SELECT * FROM daily_leaderboard
--   WHERE seed_date = current_date AND hard_mode = false LIMIT 100;

CREATE VIEW public.daily_leaderboard
WITH (security_invoker = true) AS
SELECT
  g.id,
  g.seed_date,
  g.seed_word,
  g.final_score,
  g.chain_peak,
  g.move_count,
  g.hint_count,
  g.hard_mode,
  g.created_at,
  g.user_id,
  p.display_name,
  p.avatar_url
FROM public.games g
JOIN public.profiles p ON p.id = g.user_id
ORDER BY g.seed_date DESC, g.hard_mode, g.final_score DESC, g.created_at ASC;

CREATE VIEW public.all_time_leaderboard
WITH (security_invoker = true) AS
SELECT
  g.id,
  g.final_score,
  g.seed_date,
  g.seed_word,
  g.chain_peak,
  g.move_count,
  g.hint_count,
  g.hard_mode,
  g.created_at,
  g.user_id,
  p.display_name,
  p.avatar_url
FROM public.games g
JOIN public.profiles p ON p.id = g.user_id
ORDER BY g.hard_mode, g.final_score DESC, g.created_at ASC;

GRANT SELECT ON public.daily_leaderboard TO anon, authenticated;
GRANT SELECT ON public.all_time_leaderboard TO anon, authenticated;
