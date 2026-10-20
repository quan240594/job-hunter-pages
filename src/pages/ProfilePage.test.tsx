import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStubApi, makeProfile, rejection, renderWithApi } from '../__fixtures__/uiFixtures';
import { ProfilePage } from './ProfilePage';

describe('ProfilePage', () => {
  it('loads the stored profile into the editor', async () => {
    renderWithApi(<ProfilePage />, createStubApi({ profile: { get: vi.fn(() => Promise.resolve(makeProfile())) } }));
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('Loading your profile…')).toBeInTheDocument();
    expect(await screen.findByLabelText(/Display name/)).toHaveValue('Alex Example');
    expect(screen.getByRole('article', { name: 'CV preview' })).toBeInTheDocument();
  });

  it('starts an empty editor before the first save', async () => {
    renderWithApi(<ProfilePage />, createStubApi({ profile: { get: vi.fn(() => Promise.resolve(null)) } }));
    expect(await screen.findByLabelText(/Display name/)).toHaveValue('');
    expect(screen.getByText('Not saved yet.')).toBeInTheDocument();
  });

  it('shows the error of the api and retries', async () => {
    const user = userEvent.setup();
    const get = vi.fn().mockImplementationOnce(() => rejection('network', 'Offline')).mockResolvedValueOnce(makeProfile());
    renderWithApi(<ProfilePage />, createStubApi({ profile: { get } }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText(/Display name/)).toBeInTheDocument();
  });
});
