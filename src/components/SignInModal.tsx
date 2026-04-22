import { useState } from 'react';
import { useAuth } from '../lib/auth';

type Props = {
  onClose: () => void;
};

/**
 * Minimal provider-selection modal. Three auth paths in v1:
 *   - Google OAuth
 *   - GitHub OAuth
 *   - Email magic link
 * Apple is deferred until Joe's Apple Developer org-tier account activates
 * (task #13).
 */
export function SignInModal({ onClose }: Props) {
  const { signInWith, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const withProvider = async (provider: 'google' | 'github') => {
    try {
      setBusy(true);
      await signInWith(provider);
      // signInWithOAuth redirects the browser — if we reach here, modal can close.
    } catch (err) {
      setBusy(false);
      setStatus(`Sign-in failed: ${(err as Error).message}`);
    }
  };

  const withEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    try {
      setBusy(true);
      setStatus(null);
      await signInWithEmail(email);
      setStatus(`Magic link sent to ${email}. Check your inbox.`);
      setBusy(false);
    } catch (err) {
      setBusy(false);
      setStatus(`Failed: ${(err as Error).message}`);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--gapplet-cell-bg)',
          border: '0.5px solid var(--gapplet-border)',
          borderRadius: '10px',
          padding: '1.5rem',
          maxWidth: '360px',
          width: '100%',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <div style={{ fontSize: '18px', fontWeight: 500 }}>Sign in</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ padding: '0.25rem 0.5rem', fontSize: '18px' }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button onClick={() => withProvider('google')} disabled={busy}>
            Continue with Google
          </button>
          <button onClick={() => withProvider('github')} disabled={busy}>
            Continue with GitHub
          </button>
        </div>

        <div
          style={{
            textAlign: 'center',
            fontSize: '12px',
            color: 'var(--gapplet-muted)',
            margin: '1rem 0 0.5rem',
          }}
        >
          or email a magic link
        </div>

        <form onSubmit={withEmail} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            disabled={busy}
            style={{
              flex: 1,
              padding: '0.5rem',
              border: '1px solid var(--gapplet-border)',
              borderRadius: '6px',
              fontSize: '14px',
              fontFamily: 'inherit',
            }}
          />
          <button type="submit" disabled={busy || !email}>
            Send
          </button>
        </form>

        {status && (
          <div
            style={{
              marginTop: '0.75rem',
              fontSize: '13px',
              color: 'var(--gapplet-muted)',
            }}
          >
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
