import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { SignInModal } from './SignInModal';

/**
 * Tiny auth indicator. Signed out: "Sign in" button that opens the modal.
 * Signed in: the user's display name with a menu containing "Sign out."
 * Lives in the App header for now; will move into the hamburger menu
 * Account section once task #17 ships.
 */
export function AuthButton() {
  const { profile, loading, signOut } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) {
    return (
      <span style={{ fontSize: '12px', color: 'var(--gapplet-muted)' }}>…</span>
    );
  }

  if (!profile) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          style={{ fontSize: '12px', padding: '0.35rem 0.75rem' }}
        >
          Sign in
        </button>
        {modalOpen && <SignInModal onClose={() => setModalOpen(false)} />}
      </>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setMenuOpen((o) => !o)}
        style={{ fontSize: '12px', padding: '0.35rem 0.75rem' }}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        {profile.display_name} ▾
      </button>
      {menuOpen && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            background: 'var(--gapplet-cell-bg)',
            border: '0.5px solid var(--gapplet-border)',
            borderRadius: '6px',
            padding: '0.25rem',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            zIndex: 50,
            minWidth: '140px',
          }}
        >
          <button
            onClick={async () => {
              setMenuOpen(false);
              await signOut();
            }}
            style={{
              width: '100%',
              border: 0,
              background: 'transparent',
              padding: '0.5rem 0.75rem',
              textAlign: 'left',
              fontSize: '13px',
            }}
            role="menuitem"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
