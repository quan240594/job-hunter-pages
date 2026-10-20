import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ALEX_SESSION, authValue, createStubApi } from '../__fixtures__/uiFixtures';
import type { Session } from '../api';
import { AuthContext } from '../auth/context';
import type { AuthContextValue } from '../auth/context';
import { Layout } from './Layout';

const ADMIN_SESSION: Session = { ...ALEX_SESSION, email: 'admin@example.com', role: 'admin' };

function renderLayout(value: AuthContextValue, path = '/found') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={value}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/found" element={<h1>Found page</h1>} />
            <Route path="/applied" element={<h1>Applied page</h1>} />
          </Route>
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('Layout', () => {
  it('shows the navigation, the current page, the signed-in user and their role', () => {
    renderLayout(authValue(createStubApi()));
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(Array.from(nav.querySelectorAll('a')).map((link) => link.textContent)).toEqual([
      'New',
      'Found',
      'Applied',
      'Profile',
      'Documents',
      'Account',
    ]);
    expect(screen.getByRole('link', { name: 'Found' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Applied' })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { name: 'Found page' }));
  });

  it('adds the Admin link and badge for an admin', () => {
    renderLayout(authValue(createStubApi(), ADMIN_SESSION));
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByText('Admin', { selector: '.badge' })).toBeInTheDocument();
  });

  it('shows no user while signed out', () => {
    renderLayout(authValue(createStubApi(), null));
    expect(screen.queryByText('alex@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('navigates with the links', async () => {
    const user = userEvent.setup();
    renderLayout(authValue(createStubApi()));
    await user.click(screen.getByRole('link', { name: 'Applied' }));
    expect(screen.getByRole('heading', { name: 'Applied page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Applied' })).toHaveAttribute('aria-current', 'page');
  });

  it('signs out', async () => {
    const user = userEvent.setup();
    const value = authValue(createStubApi());
    renderLayout(value);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(value.signOut).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says when signing out failed and clears the message on the next try', async () => {
    const user = userEvent.setup();
    const value = authValue(createStubApi());
    value.signOut = vi
      .fn()
      .mockRejectedValueOnce({ code: 'network', message: 'Offline' })
      .mockResolvedValueOnce(undefined);
    renderLayout(value);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out: Offline');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('has a skip link that moves focus to the main area without changing the route', async () => {
    const user = userEvent.setup();
    renderLayout(authValue(createStubApi()));
    await user.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(screen.getByRole('main')).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Found page' })).toBeInTheDocument();
  });

  it('keeps the navigation and header out of the printout', () => {
    renderLayout(authValue(createStubApi()));
    expect(screen.getByRole('banner')).toHaveClass('no-print');
    expect(screen.getByRole('navigation', { name: 'Main' })).toHaveClass('no-print');
  });
});
