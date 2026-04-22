/**
 * Auth context + hook. Wraps @supabase/supabase-js's auth state in a small
 * React-friendly API. Consumers read `session`, `user`, `profile`, and get
 * `signInWith`, `signInWithEmail`, `signOut` for action.
 *
 * Profile is fetched lazily from the `profiles` table on session change;
 * the auto-create trigger (migration 20260422020000) guarantees the row
 * exists by the time the user has a valid session.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User, Provider } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signInWith: (provider: Provider) => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load initial session + subscribe to changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Fetch profile whenever the signed-in user changes
  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('Profile fetch failed:', error.message);
          return;
        }
        setProfile(data as Profile);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const signInWith = useCallback(async (provider: Provider) => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signInWith,
    signInWithEmail,
    signOut,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
