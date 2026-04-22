/**
 * Supabase client singleton. Reads URL + publishable key from Vite env vars;
 * both are safe to ship in the browser bundle (publishable keys are designed
 * to be public-exposed and everything sensitive goes through RLS).
 *
 * Matching types will be generated later via `supabase gen types typescript`;
 * for now the client is untyped and queries fall back to `any`.
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env.local and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  );
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // catches OAuth and magic-link redirect params
  },
});
