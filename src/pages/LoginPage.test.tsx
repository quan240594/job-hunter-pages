import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createFakeApi } from '../__fixtures__/fakeApi';
import { ALEX } from '../__fixtures__/fakeApi';
import { renderApp } from '../__fixtures__/renderApp';
import type { AuthApi } from '../api/dataApi';
import type { ApiErrorCode, Session } from '../api';

const REJECTED = 'Email or password is incorrect, or this account cannot sign in.';

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Email'), 'alex@example.com');
  await user.type(screen.getByLabelText('Password'), 'not-a-real-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  it('explains that accounts are invite-only and has no registration link', async () => {
    renderApp('/login', createFakeApi(null).api);
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Job Hunter' })).toBeInTheDocument();
    expect(screen.getByText(/accounts are created by an admin/)).toBeInTheDocument();
    expect(screen.getByText(/Ask an admin to set a temporary password/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sign up|register|create account/i })).not.toBeInTheDocument();
  });

  it('has labelled, autofill-friendly fields', async () => {
    renderApp('/login', createFakeApi(null).api);
    const email = await screen.findByLabelText('Email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(email).toBeRequired();
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toBeRequired();
    expect(screen.getByRole('form', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows a status while the session is still being read', () => {
    renderApp('/login', createFakeApi(null, { getSession: () => new Promise(() => undefined) }).api);
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('still offers the form, with an alert, when the session check failed', async () => {
    const fake = createFakeApi(null, { getSession: () => Promise.reject({ code: 'network', message: 'offline' }) });
    renderApp('/login', fake.api);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('signs in with the trimmed email and lands on the home page', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn<AuthApi['signIn']>(() => Promise.resolve(ALEX));
    renderApp('/login', createFakeApi(null, { signIn }).api);
    await user.type(await screen.findByLabelText('Email'), '  alex@example.com ');
    await user.type(screen.getByLabelText('Password'), 'not-a-real-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'New' })).toBeInTheDocument();
    expect(signIn).toHaveBeenCalledWith('alex@example.com', 'not-a-real-password');
    expect(screen.getByTestId('location')).toHaveTextContent('/new');
  });

  it('returns to the page the visitor was heading to', async () => {
    const user = userEvent.setup();
    renderApp('/applied', createFakeApi(null).api);
    await fillAndSubmit(user);
    expect(await screen.findByRole('heading', { level: 1, name: 'Applied' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/applied');
  });

  it('disables the button while signing in', async () => {
    const user = userEvent.setup();
    let release!: (session: Session) => void;
    const signIn = () => new Promise<Session>((resolve) => (release = resolve));
    renderApp('/login', createFakeApi(null, { signIn }).api);
    await fillAndSubmit(user);
    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled();
    release(ALEX);
    expect(await screen.findByRole('heading', { level: 1, name: 'New' })).toBeInTheDocument();
  });

  it.each(['unauthenticated', 'forbidden', 'not_found', 'validation', 'conflict'] as ApiErrorCode[])(
    'shows one neutral message for %s so accounts cannot be enumerated',
    async (code) => {
      const user = userEvent.setup();
      renderApp('/login', createFakeApi(null, { signIn: () => Promise.reject({ code, message: 'User banned' }) }).api);
      await fillAndSubmit(user);
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(REJECTED);
      expect(alert).not.toHaveTextContent('banned');
      expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(REJECTED);
      expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(REJECTED);
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    },
  );

  it('is honest about network problems and unexpected failures', async () => {
    const user = userEvent.setup();
    const signIn = vi
      .fn<AuthApi['signIn']>()
      .mockRejectedValueOnce({ code: 'network', message: 'x' })
      .mockRejectedValueOnce(new TypeError('boom'));
    renderApp('/login', createFakeApi(null, { signIn }).api);
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
  });

  it('clears the previous error when retrying', async () => {
    const user = userEvent.setup();
    const signIn = vi
      .fn<AuthApi['signIn']>()
      .mockRejectedValueOnce({ code: 'unauthenticated', message: 'x' })
      .mockResolvedValueOnce(ALEX);
    renderApp('/login', createFakeApi(null, { signIn }).api);
    await fillAndSubmit(user);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'New' })).toBeInTheDocument();
  });

  it('sends an already signed-in user home', async () => {
    renderApp('/login', createFakeApi(ALEX).api);
    expect(await screen.findByRole('heading', { level: 1, name: 'New' })).toBeInTheDocument();
  });
});
