import { useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { RoleBadge } from '../components/Badge';
import { AdzunaFooterNote } from '../components/AdzunaCredit';
import { useAuth } from '../auth/context';
import { errorMessage } from '../lib/errors';
import { NAV_ITEMS } from '../routes';

export function Layout() {
  const { state, signOut } = useAuth();
  const mainRef = useRef<HTMLElement>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const session = state.status === 'authenticated' ? state.session : null;
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || session?.role === 'admin');

  return (
    <div className="shell">
      {/* The route lives in the URL hash, so the skip link focuses <main> instead of navigating to #main. */}
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="app-header no-print">
        <strong className="brand">Job Hunter</strong>
        {session === null ? null : (
          <p className="user-info">
            <span>{session.email}</span> <RoleBadge role={session.role} />
          </p>
        )}
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            setSignOutError(null);
            signOut().catch((error_: unknown) => setSignOutError(errorMessage(error_)));
          }}
        >
          Sign out
        </button>
      </header>
      <nav className="tabs no-print" aria-label="Main">
        {items.map((item) => (
          <NavLink key={item.path} to={item.path} className="tab-link">
            {item.label}
          </NavLink>
        ))}
      </nav>
      {signOutError === null ? null : (
        <p role="alert" className="form-error banner">
          Could not sign out: {signOutError}
        </p>
      )}
      <main id="main" tabIndex={-1} ref={mainRef}>
        <Outlet />
      </main>
      <footer className="app-footer no-print">
        <AdzunaFooterNote />
      </footer>
    </div>
  );
}
