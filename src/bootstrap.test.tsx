import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bootstrap } from './bootstrap';

function makeRoot(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

describe('bootstrap', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('rejects when there is no root element', async () => {
    await expect(bootstrap(null, { VITE_DATA_MODE: 'mock' })).rejects.toThrow('Missing #root element');
  });

  it('shows a clear error screen when supabase mode has no url or key', async () => {
    await bootstrap(makeRoot(), { VITE_DATA_MODE: 'supabase' });
    expect(await screen.findByRole('heading', { name: 'Configuration error' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  });

  it('renders the app in mock mode and lets the demo user sign in', async () => {
    await bootstrap(makeRoot(), { VITE_DATA_MODE: 'mock' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Job Hunter' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'alex@example.com');
    await user.type(screen.getByLabelText('Password'), 'any-input');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.queryByLabelText('Email')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error screen when the api cannot be created', async () => {
    vi.resetModules();
    vi.doMock('./api', () => ({ createDataApi: () => Promise.reject(new Error('chunk failed')) }));
    const { bootstrap: isolated } = await import('./bootstrap');
    await isolated(makeRoot(), { VITE_DATA_MODE: 'mock' });
    expect(await screen.findByRole('alert')).toHaveTextContent('The app could not start: chunk failed');
    vi.doUnmock('./api');
  });
});
