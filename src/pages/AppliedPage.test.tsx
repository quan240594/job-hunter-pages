import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
import { AppliedPage } from './AppliedPage';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const JOB_A = makeJob({ id: 'job-a', title: 'Role A', company: 'Alpha BV' });
const JOB_B = makeJob({ id: 'job-b', title: 'Role B', company: 'Beta BV' });
const CV = makeDocument();
const OLDER = makeApplication({ id: 'app-a', jobId: 'job-a', appliedAt: '2026-10-01T09:00:00.000Z' });
const NEWER = makeApplication({ id: 'app-b', jobId: 'job-b', appliedAt: '2026-10-12T09:00:00.000Z', cvDocumentId: 'gone', cvLabel: 'old-cv.pdf', stage: 'interview' });

function api(overrides: Parameters<typeof createStubApi>[0] = {}) {
  return createStubApi({
    applications: { list: vi.fn(() => Promise.resolve([OLDER, NEWER])) },
    jobs: { list: vi.fn(() => Promise.resolve([JOB_A, JOB_B])) },
    documents: { list: vi.fn(() => Promise.resolve([CV])) },
    ...overrides,
  });
}

describe('AppliedPage', () => {
  it('lists the applications, newest first, with job names, the CV used and the stage', async () => {
    const stub = api();
    renderWithApi(<AppliedPage />, stub, '/applied');
    expect(screen.getByRole('heading', { level: 1, name: 'Applied' })).toBeInTheDocument();
    expect(screen.getByText('Loading applications…')).toBeInTheDocument();
    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]).getByText('Role B')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Role A')).toBeInTheDocument();
    expect(within(rows[1]).getByText('document expired')).toBeInTheDocument();
    expect(within(rows[1]).getByText('old-cv.pdf')).toBeInTheDocument();
    expect(within(rows[2]).queryByText('document expired')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Stage for Role B at Beta BV')).toHaveValue('interview');
    expect(stub.applications.list).toHaveBeenCalledWith({});
  });

  it('filters by time', async () => {
    const user = userEvent.setup();
    const stub = api();
    renderWithApi(<AppliedPage />, stub, '/applied');
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(stub.applications.list).toHaveBeenLastCalledWith({ since: '2026-10-13T10:00:00.000Z' }));
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-15' } });
    await waitFor(() => expect(stub.applications.list).toHaveBeenLastCalledWith({ since: '2026-01-14T23:00:00.000Z', until: undefined }));
  });

  it('shows an empty state', async () => {
    renderWithApi(<AppliedPage />, api({ applications: { list: vi.fn(() => Promise.resolve([])) } }), '/applied');
    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
  });

  it.each([
    ['applications', { applications: { list: vi.fn(() => rejection('network', 'Applications offline')) } }, 'Applications offline'],
    ['jobs', { jobs: { list: vi.fn(() => rejection('network', 'Jobs offline')) } }, 'Jobs offline'],
    ['documents', { documents: { list: vi.fn(() => rejection('network', 'Documents offline')) } }, 'Documents offline'],
  ])('shows the error when the %s cannot be loaded', async (_name, overrides, message) => {
    renderWithApi(<AppliedPage />, api(overrides), '/applied');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('edits the stage and keeps the saved answer', async () => {
    const user = userEvent.setup();
    const update = vi.fn(() => Promise.resolve({ ...NEWER, stage: 'offer' as const }));
    renderWithApi(<AppliedPage />, api({ applications: { list: vi.fn(() => Promise.resolve([OLDER, NEWER])), update } }), '/applied');
    await user.selectOptions(await screen.findByLabelText('Stage for Role B at Beta BV'), 'offer');
    await waitFor(() => expect(update).toHaveBeenCalledWith('app-b', { stage: 'offer' }));
    expect(screen.getByLabelText('Stage for Role B at Beta BV')).toHaveValue('offer');
  });

  it('reverts the stage and shows why when saving fails', async () => {
    const user = userEvent.setup();
    const update = vi.fn(() => rejection('network', 'Offline'));
    renderWithApi(<AppliedPage />, api({ applications: { list: vi.fn(() => Promise.resolve([OLDER, NEWER])), update } }), '/applied');
    await user.selectOptions(await screen.findByLabelText('Stage for Role B at Beta BV'), 'offer');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the change, it was reverted: Offline');
    expect(screen.getByLabelText('Stage for Role B at Beta BV')).toHaveValue('interview');
  });

  it('edits the notes', async () => {
    const user = userEvent.setup();
    const update = vi.fn(() => Promise.resolve({ ...OLDER, notes: 'call Monday' }));
    renderWithApi(<AppliedPage />, api({ applications: { list: vi.fn(() => Promise.resolve([OLDER])), update } }), '/applied');
    await user.click(await screen.findByRole('button', { name: 'Edit notes for Role A at Alpha BV' }));
    await user.type(screen.getByLabelText('Notes for Role A at Alpha BV'), 'call Monday');
    await user.click(screen.getByRole('button', { name: 'Save notes' }));
    expect(await screen.findByText('call Monday')).toBeInTheDocument();
    expect(update).toHaveBeenCalledWith('app-a', { notes: 'call Monday' });
  });

  it('undoes an application after confirming: it leaves the list and the job is back in New', async () => {
    const user = userEvent.setup();
    const remove = vi.fn(() => Promise.resolve());
    renderWithApi(<AppliedPage />, api({ applications: { list: vi.fn(() => Promise.resolve([OLDER, NEWER])), remove } }), '/applied');
    await user.click(await screen.findByRole('button', { name: 'Undo application for Role A at Alpha BV' }));
    const dialog = screen.getByRole('dialog', { name: 'Undo this application?' });
    expect(dialog).toHaveTextContent('Remove your application for Role A at Alpha BV? The job goes back to New.');
    await user.click(within(dialog).getByRole('button', { name: 'Undo application' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(remove).toHaveBeenCalledWith('app-a');
    expect(screen.queryByText('Role A')).not.toBeInTheDocument();
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'Application removed. The job is back in New.')).toBe(true);
  });

  it('keeps the application and shows the error when undoing fails, and can be cancelled', async () => {
    const user = userEvent.setup();
    const remove = vi.fn(() => rejection('network', 'Offline'));
    renderWithApi(<AppliedPage />, api({ applications: { list: vi.fn(() => Promise.resolve([OLDER])), remove } }), '/applied');
    await user.click(await screen.findByRole('button', { name: 'Undo application for Role A at Alpha BV' }));
    await user.click(screen.getByRole('button', { name: 'Undo application' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Offline');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Role A')).toBeInTheDocument();
  });

  it('words the undo question for an application whose job is gone', async () => {
    const user = userEvent.setup();
    const orphan = makeApplication({ id: 'app-x', jobId: 'missing' });
    renderWithApi(<AppliedPage />, api({ applications: { list: vi.fn(() => Promise.resolve([orphan])) } }), '/applied');
    await user.click(await screen.findByRole('button', { name: 'Undo application for Unknown job' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Remove your application for this job?');
  });
});
