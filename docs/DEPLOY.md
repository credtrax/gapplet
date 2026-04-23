# Deploy — task #11

Production host plan: **Vercel** for the frontend, **Hostinger DNS** for
`gapplet.joecorn.com` (registrar only; no hosting there). Supabase stays
where it is.

## Current state (as of 2026-04-23)

- `origin` = `https://github.com/credtrax/gapplet.git` (public repo, `main`
  pushed and clean).
- Production build is green: `npm run build` produces `dist/` at
  ~460 kB / ~145 kB gzipped, no TS errors.
- **No Vercel project linked.** No `vercel.json` in the repo; no
  `.vercel/` directory locally; `vercel` CLI not installed.
- **Auth redirects are deploy-safe.** `src/lib/auth.tsx` uses
  `window.location.origin` for both OAuth (`redirectTo`) and magic-link
  (`emailRedirectTo`) — no hardcoded `localhost:5174`. Whatever host the
  browser is on gets sent to Supabase, so `*.vercel.app` previews and the
  custom domain both work once the URLs are registered on the Supabase
  side.
- Env vars the Vite build needs (names only — values live in `.env.local`,
  gitignored):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`

## Deploy checklist

Do these in order. The first several steps produce a working
`*.vercel.app` URL; the domain cutover happens last so there's always a
known-good fallback.

### 1. Repo prep (Claude can do solo)

- [ ] Add a minimal `vercel.json` with SPA fallback so deep-linked routes
      resolve to `index.html`. (Not strictly required today — the game is
      single-route — but cheap insurance against future routing.)
- [ ] Commit + push.

### 2. Vercel project (Joe drives, dashboard)

- [ ] Log into Vercel (create the project under Joe's personal account,
      not a Stone & Spark / CredentialTrax org — this is a personal side
      project).
- [ ] "Add New → Project" → import `credtrax/gapplet` from GitHub.
- [ ] Framework preset: **Vite** (auto-detected).
- [ ] Build command: leave default (`npm run build`).
- [ ] Output directory: `dist` (default).
- [ ] Environment variables → add for **Production** and **Preview**:
  - `VITE_SUPABASE_URL` — from `.env.local`
  - `VITE_SUPABASE_PUBLISHABLE_KEY` — from `.env.local`
- [ ] Deploy. Note the resulting `*.vercel.app` URL.

### 3. Register the Vercel URL as an auth origin (Joe drives, dashboards)

Supabase + each OAuth provider need to trust the new origin.

- [ ] **Supabase** → Authentication → URL Configuration:
  - Site URL: `https://gapplet.joecorn.com` (set this to the final domain
    even before DNS is live — it's what the magic-link email template
    embeds by default; redirect URLs below cover the preview host)
  - Additional Redirect URLs: add both
    `https://<project>.vercel.app/**` and `https://gapplet.joecorn.com/**`
    (keep `http://localhost:5174/**` for dev)
- [ ] **Google Cloud Console** → the existing OAuth 2.0 client →
      Authorized redirect URIs: add the Supabase callback URL exactly as
      shown in Supabase's Google provider page for each origin. (Google's
      redirect is always the Supabase project's
      `/auth/v1/callback`, not the Vercel URL — but double-check against
      what the Supabase provider panel displays.)
- [ ] **GitHub** → OAuth App settings → Authorization callback URL: same
      pattern. GitHub only accepts a single callback URL, so this
      typically points at the Supabase callback (already correct; no
      change needed unless the Supabase callback itself moved).

### 4. Smoke-test on the Vercel URL (Joe + Claude)

- [ ] Open `https://<project>.vercel.app/`. Confirm the daily board
      loads, the keyboard works, and the how-to-play tutorial auto-opens.
- [ ] Sign in with Google. Confirm redirect lands back on the Vercel URL
      (not localhost).
- [ ] Play a short game, submit, refresh — confirm the score appears on
      the daily leaderboard.
- [ ] Open the shared emoji timeline from the Share button and confirm it
      copies cleanly.
- [ ] Try `?practice=1` — confirm it does NOT write to the leaderboard.

### 5. Custom domain (Joe drives, Hostinger + Vercel)

- [ ] Vercel → project → Domains → add `gapplet.joecorn.com`. Vercel will
      display the DNS record it wants (typically a CNAME to
      `cname.vercel-dns.com`).
- [ ] Hostinger DNS (`joecorn.com` zone) → add a CNAME record:
  - Name: `gapplet`
  - Target: value Vercel displays
  - TTL: default
- [ ] Wait for DNS propagation (usually < 5 min; can be up to an hour).
      Vercel's domain page will flip to "Valid configuration" and issue
      the TLS cert automatically.

### 6. Final smoke-test at the custom domain

- [ ] Repeat step 4 checks at `https://gapplet.joecorn.com/`.
- [ ] Confirm TLS cert is valid (lock icon, not a warning).
- [ ] Confirm auth redirects land on `gapplet.joecorn.com`, not the
      `*.vercel.app` host.

### 7. Post-deploy hygiene

- [ ] Update `docs/ROADMAP.md`: move task #11 from "Pre-launch remaining"
      to done.
- [ ] Tag a git commit `v0.1.0-launch` so there's a named anchor.
- [ ] Open an issue or note in memory for launch-window monitoring (first
      24h — watch for auth failures, score-validation rejections).

## Things to decide before step 2

- **Vercel account**: personal (joecorn@...) or does one already exist?
  The project should live under Joe's personal account, not any
  Stone & Spark / CredentialTrax org.
- **Production branch**: `main` is fine — no staging branch currently
  exists and the game is still pre-launch.
- **Preview deploys on PRs**: recommended on. The anti-cheat invariant
  is preserved regardless (previews hit the same Supabase project, and
  RLS still blocks client writes to `games`).

## Known risks / watch-outs

- The `validate-score` Edge Function URL is independent of the frontend
  host — it's `https://<supabase-ref>.functions.supabase.co/validate-score`
  and doesn't change when the frontend moves to Vercel. No config churn
  there.
- Do not put the **service role key** or the Supabase DB password into
  Vercel env vars. The browser only needs the publishable key, and that
  alone (thanks to the RLS insert-lock on `games`) is safe to ship in the
  client bundle.
- If Supabase Auth emails land in spam from the `*.vercel.app` preview
  host, that's normal pre-domain — retest after the custom domain is
  live and Site URL points at it.
