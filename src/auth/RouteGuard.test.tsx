import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ADMIN, ALEX, createFakeApi } from '../__fixtures__/fakeApi';
import type { DataApi, Session } from '../api';
import { AuthProvider } from './AuthProvider';
import { RouteGuard } from './RouteGuard';

function Where() {
  const { pathname, search, state } = useLocation();
  return (
    <p data-testid="where">
      {pathname}
      {search}|{JSON.stringify(state)}
    </p>
  );
}

function renderAt(path: string, api: DataApi, requireAdmin = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider api={api}>
        <Routes>
          <Route path="/login" element={<Where />} />
          <Route path="/change-password" element={<RouteGuard><p>change password page</p></RouteGuard>} />
          <Route path="/new" element={<p>home page</p>} />
          <Route path="/secret" element={<RouteGuard requireAdmin={requireAdmin}><p>secret page</p></RouteGuard>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RouteGuard', () => {
  it('shows a loading status while the session is read', () => {
    renderAt('/secret', createFakeApi(null).api);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('sends anonymous visitors to the login page and keeps the return path', async () => {
    renderAt('/secret?tab=2', createFakeApi(null).api);
    expect(await screen.findByTestId('where')).toHaveTextContent('/login|{"from":"/secret?tab=2"}');
  });

  it('shows a friendly alert, not the raw message, when the session check failed', async () => {
    const fake = createFakeApi(null, { getSession: () => Promise.reject({ code: 'network', message: 'ECONNRESET' }) });
    renderAt('/secret', fake.api);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the server');
    expect(alert).not.toHaveTextContent('ECONNRESET');
  });

  it('renders the page for a signed-in user', async () => {
    renderAt('/secret', createFakeApi(ALEX).api);
    expect(await screen.findByText('secret page')).toBeInTheDocument();
  });

  it('shows the forbidden screen to non-admins on admin pages', async () => {
    renderAt('/secret', createFakeApi(ALEX).api, true);
    expect(await screen.findByRole('heading', { name: 'Not allowed' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('admin account');
    expect(screen.getByRole('link', { name: 'Back to your jobs' })).toHaveAttribute('href', '/new');
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
  });

  it('lets admins into admin pages', async () => {
    renderAt('/secret', createFakeApi(ADMIN).api, true);
    expect(await screen.findByText('secret page')).toBeInTheDocument();
  });

  describe('forced password change', () => {
    const mustChange: Session = { ...ALEX, mustChangePassword: true };

    it('sends the user to the change-password page before anything else', async () => {
      renderAt('/secret', createFakeApi(mustChange).api);
      expect(await screen.findByText('change password page')).toBeInTheDocument();
      expect(screen.queryByText('secret page')).not.toBeInTheDocument();
    });

    it('goes before the admin check too', async () => {
      renderAt('/secret', createFakeApi({ ...ADMIN, mustChangePassword: true }).api, true);
      expect(await screen.findByText('change password page')).toBeInTheDocument();
    });

    it('does not loop on the change-password page itself', async () => {
      renderAt('/change-password', createFakeApi(mustChange).api);
      expect(await screen.findByText('change password page')).toBeInTheDocument();
    });
  });
});
