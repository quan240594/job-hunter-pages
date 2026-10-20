import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  NOW,
  createStubApi,
  makeApplication,
  makeDocument,
  makeJob,
  rejection,
  renderWithApi,
} from '../__fixtures__/uiFixtures';
import { NewPage } from './NewPage';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const CV = makeDocument({ id: 'cv-a', filename: 'cv-a.pdf' });
const BEST = makeJob({ id: 'best', title: 'Best Fit Role', fit: 5, recommendedDocumentIds: ['cv-a'] });
const OKAY = makeJob({ id: 'okay', title: 'Okay Role', fit: 2 });

function api(overrides: Parameters<typeof createStubApi>[0] = {}) {
  return createStubApi({
    jobs: { list: vi.fn(() => Promise.resolve([OKAY, BEST])) },
    documents: { list: vi.fn(() => Promise.resolve([CV])) },
    ...overrides,
  });
}

describe('NewPage', () => {
  it('lists new jobs best fit first with their recommended documents', async () => {
    const stub = api();
    renderWithApi(<NewPage />, stub);
    expect(screen.getByRole('heading', { level: 1, name: 'New' })).toBeInTheDocument();
    expect(screen.getByText('Loading new jobs…')).toBeInTheDocument();
    const cards = await screen.findAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual(['Best Fit Role', 'Okay Role']);
    expect(screen.getByText('2 new jobs')).toBeInTheDocument();
    expect(await within(cards[0]).findByText('CV: cv-a.pdf')).toBeInTheDocument();
    expect(stub.jobs.list).toHaveBeenCalledWith({ status: 'new' });
  });

  it('uses the singular for one job', async () => {
    renderWithApi(<NewPage />, api({ jobs: { list: vi.fn(() => Promise.resolve([BEST])) } }));
    expect(await screen.findByText('1 new job')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    renderWithApi(<NewPage />, api({ jobs: { list: vi.fn(() => Promise.resolve([])) } }));
    expect(await screen.findByText('No new jobs')).toBeInTheDocument();
  });

  it('shows the error of the api and retries', async () => {
    const user = userEvent.setup();
    const list = vi.fn().mockImplementationOnce(() => rejection('network', 'Offline')).mockResolvedValueOnce([BEST]);
    renderWithApi(<NewPage />, api({ jobs: { list } }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('article')).toBeInTheDocument();
  });

  it('warns when the documents cannot be loaded but still lists the jobs', async () => {
    renderWithApi(<NewPage />, api({ documents: { list: vi.fn(() => rejection('network', 'Docs offline')) } }));
    expect(await screen.findByText(/recommendations are hidden: Docs offline/)).toBeInTheDocument();
    expect(await screen.findAllByRole('article')).toHaveLength(2);
  });

  it('skips a job: it disappears and the result is announced', async () => {
    const user = userEvent.setup();
    const setStatus = vi.fn(() => Promise.resolve(makeJob({ status: 'skipped' })));
    renderWithApi(<NewPage />, api({ jobs: { list: vi.fn(() => Promise.resolve([OKAY, BEST])), setStatus } }));
    const best = await screen.findByRole('article', { name: 'Best Fit Role' });
    await user.click(within(best).getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Best Fit Role' })).not.toBeInTheDocument());
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'Skipped Best Fit Role at Example BV.')).toBe(true);
    expect(screen.getByRole('article', { name: 'Okay Role' })).toBeInTheDocument();
  });

  it('marks a job applied through the apply dialog', async () => {
    const user = userEvent.setup();
    const apply = vi.fn(() => Promise.resolve(makeApplication()));
    renderWithApi(<NewPage />, api({ applications: { apply } }));
    const best = await screen.findByRole('article', { name: 'Best Fit Role' });
    await user.click(within(best).getByRole('button', { name: 'Mark applied' }));
    expect(screen.getByLabelText('CV used')).toHaveValue('cv-a');
    await user.click(screen.getByRole('button', { name: 'Save application' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Best Fit Role' })).not.toBeInTheDocument());
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'best', cvDocumentId: 'cv-a', cvLabel: 'cv-a.pdf' }));
  });

  it('adds a job manually and reloads the list', async () => {
    const user = userEvent.setup();
    const added = makeJob({ id: 'manual-1', title: 'Manual Role', source: 'manual', fit: 0 });
    const list = vi.fn().mockResolvedValueOnce([BEST]).mockResolvedValueOnce([BEST, added]);
    const addManual = vi.fn(() => Promise.resolve(added));
    renderWithApi(<NewPage />, api({ jobs: { list, addManual } }));
    await screen.findByRole('article', { name: 'Best Fit Role' });
    await user.click(screen.getByRole('button', { name: 'Add job manually' }));
    await user.type(screen.getByLabelText(/Job title/), 'Manual Role');
    await user.type(screen.getByLabelText(/Company/), 'Example BV');
    await user.type(screen.getByLabelText(/Location/), 'Amsterdam');
    await user.click(screen.getByRole('button', { name: 'Add job' }));
    expect(await screen.findByRole('article', { name: 'Manual Role' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'Added Manual Role at Example BV.')).toBe(true);
  });

  it('can cancel the manual form', async () => {
    const user = userEvent.setup();
    renderWithApi(<NewPage />, api());
    await screen.findAllByRole('article');
    await user.click(screen.getByRole('button', { name: 'Add job manually' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
