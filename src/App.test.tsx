import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ADMIN, ALEX, createFakeApi } from './__fixtures__/fakeApi';
import { App, AppRoutes } from './App';
import type { DataApi } from './api';
import { AuthProvider } from './auth/AuthProvider';
import { NAV_ITEMS } from './routes';

function renderRoutes(path: string, api: DataApi) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider api={api}>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AppRoutes', () => {
  it.each(NAV_ITEMS.filter((item) => !item.adminOnly))('renders $label at $path for a user', async ({ path, label }) => {
    renderRoutes(path, createFakeApi(ALEX).api);
    expect(await screen.findByRole('heading', { level: 1, name: label })).toBeInTheDocument();
  });

  it('renders the admin page for an admin and shows the admin link', async () => {
    renderRoutes('/admin', createFakeApi(ADMIN).api);
    expect(await screen.findByRole('heading', { level: 1, name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('hides the admin link and shows the forbidden screen on the admin page for a user', async () => {
    renderRoutes('/admin', createFakeApi(ALEX).api);
    expect(await screen.findByRole('heading', { level: 1, name: 'Not allowed' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('redirects unknown paths home', async () => {
    renderRoutes('/nowhere', createFakeApi(ALEX).api);
    expect(await screen.findByRole('heading', { level: 1, name: 'New' })).toBeInTheDocument();
  });

  it('redirects anonymous visitors to the login form', async () => {
    renderRoutes('/found', createFakeApi(null).api);
    expect(await screen.findByRole('heading', { level: 1, name: 'Job Hunter' })).toBeInTheDocument();
  });

  it('signs out from the menu', async () => {
    const user = userEvent.setup();
    renderRoutes('/new', createFakeApi(ALEX).api);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });

  it('survives a failing sign-out', async () => {
    const user = userEvent.setup();
    const fake = createFakeApi(ALEX, { signOut: () => Promise.reject({ code: 'network', message: 'offline' }) });
    renderRoutes('/new', fake.api);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('heading', { level: 1, name: 'New' })).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  it('signs in and lands on the home page', async () => {
    const user = userEvent.setup();
    renderRoutes('/login', createFakeApi(null).api);
    await user.type(await screen.findByLabelText('Email'), 'alex@example.com');
    await user.type(screen.getByLabelText('Password'), 'not-a-real-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'New' })).toBeInTheDocument();
  });

  it('shows the error of a failed sign-in and lets the user retry', async () => {
    const user = userEvent.setup();
    const fake = createFakeApi(null, {
      signIn: () => Promise.reject({ code: 'unauthenticated', message: 'Invalid login credentials' }),
    });
    renderRoutes('/login', fake.api);
    await user.type(await screen.findByLabelText('Email'), 'alex@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('sends an already signed-in user home', async () => {
    renderRoutes('/login', createFakeApi(ALEX).api);
    expect(await screen.findByRole('heading', { level: 1, name: 'New' })).toBeInTheDocument();
  });
});

describe('App', () => {
  it('uses hash routing', async () => {
    window.location.hash = '#/found';
    render(<App api={createFakeApi(ALEX).api} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Found' })).toBeInTheDocument();
    window.location.hash = '';
  });
});
