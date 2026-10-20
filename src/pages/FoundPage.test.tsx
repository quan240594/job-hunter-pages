import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NOW, createStubApi, makeJob, rejection, renderWithApi } from '../__fixtures__/uiFixtures';
import { FoundPage } from './FoundPage';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const NEWEST = makeJob({ id: 'newest', title: 'Newest Role', firstSeenAt: '2026-10-19T00:00:00.000Z', fit: 2 });
const BEST = makeJob({ id: 'best', title: 'Best Role', firstSeenAt: '2026-10-10T00:00:00.000Z', fit: 5 });
const SKIPPED = makeJob({ id: 'skipped', title: 'Skipped Role', firstSeenAt: '2026-10-05T00:00:00.000Z', fit: 3, status: 'skipped' });

function api(list = vi.fn(() => Promise.resolve([BEST, SKIPPED, NEWEST])), overrides: Parameters<typeof createStubApi>[0] = {}) {
  return createStubApi({ jobs: { list }, documents: { list: vi.fn(() => Promise.resolve([])) }, ...overrides });
}

const titles = () =>
  within(screen.getByRole('table', { name: 'Jobs found' }))
    .getAllByRole('button')
    .map((button) => button.textContent);

describe('FoundPage', () => {
  it('lists every job, newest first, with a heading and the filters', async () => {
    const stub = api();
    renderWithApi(<FoundPage />, stub, '/found');
    expect(screen.getByRole('heading', { level: 1, name: 'Found' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Jobs found' })).toBeInTheDocument();
    expect(titles()).toEqual(['Newest Role', 'Best Role', 'Skipped Role']);
    expect(stub.jobs.list).toHaveBeenCalledWith({ status: undefined, search: undefined });
    expect(screen.getByRole('group', { name: 'Time range (first seen)' })).toBeInTheDocument();
  });

  it('sorts by fit, ascending or descending, from the URL', async () => {
    renderWithApi(<FoundPage />, api(), '/found?sort=fit&order=asc');
    await screen.findByRole('table');
    expect(titles()).toEqual(['Newest Role', 'Skipped Role', 'Best Role']);
  });

  it('changes the sort through the controls', async () => {
    const user = userEvent.setup();
    renderWithApi(<FoundPage />, api(), '/found');
    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText('Sort by'), 'fit');
    expect(titles()).toEqual(['Best Role', 'Skipped Role', 'Newest Role']);
    await user.selectOptions(screen.getByLabelText('Order'), 'asc');
    expect(titles()).toEqual(['Newest Role', 'Skipped Role', 'Best Role']);
  });

  it('asks the api for a status, a time range and a search text', async () => {
    const user = userEvent.setup();
    const stub = api();
    renderWithApi(<FoundPage />, stub, '/found');
    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText('Status'), 'skipped');
    await waitFor(() => expect(stub.jobs.list).toHaveBeenLastCalledWith({ status: 'skipped', search: undefined }));
    await user.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() =>
      expect(stub.jobs.list).toHaveBeenLastCalledWith({ since: '2026-09-20T10:00:00.000Z', status: 'skipped', search: undefined }),
    );
    await user.type(screen.getByRole('searchbox'), 'react');
    await waitFor(() =>
      expect(stub.jobs.list).toHaveBeenLastCalledWith({ since: '2026-09-20T10:00:00.000Z', status: 'skipped', search: 'react' }),
    );
  });

  it('supports a custom date range', async () => {
    const user = userEvent.setup();
    const stub = api();
    renderWithApi(<FoundPage />, stub, '/found');
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-15' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-01-16' } });
    await waitFor(() =>
      expect(stub.jobs.list).toHaveBeenLastCalledWith({
        since: '2026-01-14T23:00:00.000Z',
        until: '2026-01-16T22:59:59.999Z',
        status: undefined,
        search: undefined,
      }),
    );
  });

  it('shows an empty state when nothing matches', async () => {
    renderWithApi(<FoundPage />, api(vi.fn(() => Promise.resolve([]))), '/found');
    expect(await screen.findByText('No jobs match these filters')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('shows the api error and retries', async () => {
    const user = userEvent.setup();
    const list = vi.fn().mockImplementationOnce(() => rejection('network', 'Offline')).mockResolvedValueOnce([BEST]);
    renderWithApi(<FoundPage />, api(list), '/found');
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('pages through more than 50 jobs and clamps a page beyond the end', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 60 }, (_, index) =>
      makeJob({ id: `job-${index}`, title: `Role ${index}`, firstSeenAt: new Date(NOW.getTime() - index * 60_000).toISOString() }),
    );
    renderWithApi(<FoundPage />, api(vi.fn(() => Promise.resolve(many))), '/found');
    await screen.findByRole('table');
    expect(screen.getByText('1–50 of 60 · page 1 of 2')).toBeInTheDocument();
    expect(titles()).toHaveLength(50);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('51–60 of 60 · page 2 of 2')).toBeInTheDocument();
    expect(titles()).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('1–50 of 60 · page 1 of 2')).toBeInTheDocument();
  });

  it('clamps an out-of-range page from the URL', async () => {
    renderWithApi(<FoundPage />, api(), '/found?page=9');
    await screen.findByRole('table');
    expect(screen.getByText('1–3 of 3 · page 1 of 1')).toBeInTheDocument();
  });

  it('opens a job in a dialog and reloads the list after skipping it', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockResolvedValueOnce([NEWEST])
      .mockResolvedValueOnce([{ ...NEWEST, status: 'skipped' as const }]);
    const setStatus = vi.fn(() => Promise.resolve(makeJob({ status: 'skipped' })));
    renderWithApi(<FoundPage />, api(list, { jobs: { list, setStatus } }), '/found');
    await user.click(await screen.findByRole('button', { name: 'Newest Role' }));
    const dialog = screen.getByRole('dialog', { name: 'Newest Role' });
    await user.click(within(dialog).getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Skipped', { selector: '.badge' })).toBeInTheDocument();
  });

  it('opens a job even when the documents could not be loaded', async () => {
    const user = userEvent.setup();
    renderWithApi(
      <FoundPage />,
      api(undefined, { documents: { list: vi.fn(() => rejection('network', 'Docs offline')) } }),
      '/found',
    );
    await user.click(await screen.findByRole('button', { name: 'Best Role' }));
    expect(screen.getByRole('dialog', { name: 'Best Role' })).toBeInTheDocument();
  });

  it('closes the job dialog with Escape', async () => {
    const user = userEvent.setup();
    renderWithApi(<FoundPage />, api(), '/found');
    await user.click(await screen.findByRole('button', { name: 'Best Role' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('adds a job manually and reloads', async () => {
    const user = userEvent.setup();
    const added = makeJob({ id: 'manual', title: 'Manual Role', source: 'manual' });
    const list = vi.fn().mockResolvedValueOnce([BEST]).mockResolvedValueOnce([BEST, added]);
    renderWithApi(<FoundPage />, api(list, { jobs: { list, addManual: vi.fn(() => Promise.resolve(added)) } }), '/found');
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Add job manually' }));
    await user.type(screen.getByLabelText(/Job title/), 'Manual Role');
    await user.type(screen.getByLabelText(/Company/), 'Example BV');
    await user.type(screen.getByLabelText(/Location/), 'Amsterdam');
    await user.click(screen.getByRole('button', { name: 'Add job' }));
    expect(await screen.findByRole('button', { name: 'Manual Role' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('can cancel the manual form', async () => {
    const user = userEvent.setup();
    renderWithApi(<FoundPage />, api(), '/found');
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Add job manually' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
