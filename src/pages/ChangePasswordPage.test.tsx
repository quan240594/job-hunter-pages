import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ALEX, createFakeApi } from '../__fixtures__/fakeApi';
import { renderApp } from '../__fixtures__/renderApp';
import type { AuthApi } from '../api/dataApi';
import type { Session } from '../api';

const STRONG = 'Correct Horse 9 Battery';

/** A fake whose session flips to "password changed" once changePassword succeeded, like the real backend. */
function forcedApi(extra: Partial<AuthApi> = {}) {
  let session: Session = { ...ALEX, mustChangePassword: true };
  return createFakeApi(null, {
    getSession: () => Promise.resolve(session),
    changePassword: () => {
      session = { ...session, mustChangePassword: false };
      return Promise.resolve();
    },
    ...extra,
  });
}

describe('ChangePasswordPage (forced first login)', () => {
  it('captures every guarded route and keeps the user on the page', async () => {
    renderApp('/found', forcedApi().api);
    expect(await screen.findByRole('heading', { level: 1, name: 'Choose a new password' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/change-password');
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('also blocks the account page until the password was changed', async () => {
    renderApp('/account', forcedApi().api);
    expect(await screen.findByRole('heading', { level: 1, name: 'Choose a new password' })).toBeInTheDocument();
  });

  it('changes the password and continues to the page the user wanted', async () => {
    const user = userEvent.setup();
    renderApp('/found', forcedApi().api);
    await user.type(await screen.findByLabelText('New password'), STRONG);
    await user.type(screen.getByLabelText('Confirm new password'), STRONG);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Found' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/found');
  });

  it('lets the user sign out instead', async () => {
    const user = userEvent.setup();
    renderApp('/found', forcedApi().api);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });

  it('survives a failing sign-out', async () => {
    const user = userEvent.setup();
    renderApp('/found', forcedApi({ signOut: () => Promise.reject({ code: 'network', message: 'x' }) }).api);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Choose a new password' })).toBeInTheDocument();
  });

  it('sends users who do not need it to the account page', async () => {
    renderApp('/change-password', createFakeApi(ALEX).api);
    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/account');
  });

  it('sends anonymous visitors to the login page', async () => {
    renderApp('/change-password', createFakeApi(null).api);
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });
});
