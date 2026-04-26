import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { SignInModal } from './SignInModal';

/**
 * Hamburger menu in the header — replaces the standalone Sign-in button
 * + name dropdown. For consistency at narrow viewports (iPhone, etc.)
 * the auth controls move behind a single ☰ that opens a small dropdown
 * panel.
 *
 * Today the panel only contains auth (Sign in OR a "Signed in as NAME"
 * row + Sign out). Future home for Score History, Settings, How-to-Play
 * link, etc.
 *
 * Closes on outside-pointer or Escape.
 */
export function HamburgerMenu() {
  const { profile, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
        style={{
          fontSize: '20px',
          padding: '0.25rem 0.55rem',
          fontWeight: 500,
          lineHeight: 1,
        }}
      >
        ☰
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            background: 'var(--gapplet-cell-bg)',
            border: '0.5px solid var(--gapplet-border)',
            borderRadius: '8px',
            padding: '0.25rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
            zIndex: 50,
            minWidth: '180px',
          }}
        >
          {loading ? (
            <div
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '13px',
                color: 'var(--gapplet-muted)',
              }}
            >
              Loading…
            </div>
          ) : profile ? (
            <>
              <div
                style={{
                  padding: '0.5rem 0.75rem 0.15rem',
                  fontSize: '10px',
                  color: 'var(--gapplet-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 600,
                }}
              >
                Signed in as
              </div>
              <div
                style={{
                  padding: '0 0.75rem 0.5rem',
                  fontSize: '14px',
                  fontWeight: 500,
                  borderBottom: '0.5px solid var(--gapplet-border)',
                  marginBottom: '0.25rem',
                }}
              >
                {profile.display_name}
              </div>
              <button
                onClick={async () => {
                  setOpen(false);
                  await signOut();
                }}
                role="menuitem"
                style={MENU_ITEM_STYLE}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setOpen(false);
                setModalOpen(true);
              }}
              role="menuitem"
              style={MENU_ITEM_STYLE}
            >
              Sign in
            </button>
          )}
        </div>
      )}
      {modalOpen && <SignInModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

const MENU_ITEM_STYLE: React.CSSProperties = {
  width: '100%',
  border: 0,
  background: 'transparent',
  padding: '0.5rem 0.75rem',
  textAlign: 'left',
  fontSize: '13px',
  cursor: 'pointer',
  borderRadius: '4px',
};
