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
import { DEFAULT_TIME_FILTER } from '../lib/timeFilter';
import { JobCard } from './JobCard';
import { JobDetailDialog } from './JobDetailDialog';
import { JobFiltersBar } from './JobFiltersBar';
import { JobsTable } from './JobsTable';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const CV = makeDocument({ id: 'cv-a', filename: 'cv-a.pdf' });
const LETTER = makeDocument({ id: 'letter-1', kind: 'letter', filename: 'letter-1.pdf' });

describe('JobCard', () => {
  const job = makeJob({ recommendedDocumentIds: ['cv-a', 'letter-1', 'gone'] });

  it('shows the job, recommended documents as chips and the actions', () => {
    renderWithApi(<JobCard job={job} documents={[CV, LETTER]} onResolved={vi.fn()} />, createStubApi());
    const card = screen.getByRole('article', { name: 'Frontend Engineer' });
    expect(within(card).getByText('Example BV')).toBeInTheDocument();
    expect(within(card).getByText('Build accessible interfaces with React.')).toBeInTheDocument();
    const chips = within(within(card).getByRole('list', { name: 'Recommended documents' })).getAllByRole('listitem');
    expect(chips.map((chip) => chip.textContent)).toEqual(['CV: cv-a.pdf', 'Cover letter: letter-1.pdf']);
    expect(within(card).getByRole('link', { name: /View posting/ })).toBeInTheDocument();
  });

  it('says so when nothing is recommended and truncates a long description', () => {
    renderWithApi(
      <JobCard job={makeJob({ description: 'word '.repeat(100), recommendedDocumentIds: [] })} documents={[CV]} onResolved={vi.fn()} />,
      createStubApi(),
    );
    expect(screen.getByText('No recommended documents for this job.')).toBeInTheDocument();
    expect(screen.getByText(/^word word.*…$/)).toBeInTheDocument();
  });

  it('omits the summary of a job without description', () => {
    renderWithApi(<JobCard job={makeJob({ description: '' })} documents={[]} onResolved={vi.fn()} />, createStubApi());
    expect(screen.queryByText('Build accessible interfaces with React.')).not.toBeInTheDocument();
  });

  it('skips the job through the api', async () => {
    const user = userEvent.setup();
    const setStatus = vi.fn(() => Promise.resolve(makeJob({ status: 'skipped' })));
    const onResolved = vi.fn();
    renderWithApi(<JobCard job={job} documents={[CV]} onResolved={onResolved} />, createStubApi({ jobs: { setStatus } }));
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('job-1', 'Skipped Frontend Engineer at Example BV.'));
    expect(setStatus).toHaveBeenCalledWith('job-1', 'skipped');
  });

  it('shows the error when skipping fails', async () => {
    const user = userEvent.setup();
    renderWithApi(
      <JobCard job={job} documents={[CV]} onResolved={vi.fn()} />,
      createStubApi({ jobs: { setStatus: vi.fn(() => rejection('network', 'Offline')) } }),
    );
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  });

  it('opens the apply dialog, preselects the recommended CV and reports the application', async () => {
    const user = userEvent.setup();
    const apply = vi.fn(() => Promise.resolve(makeApplication()));
    const onResolved = vi.fn();
    renderWithApi(<JobCard job={job} documents={[CV, LETTER]} onResolved={onResolved} />, createStubApi({ applications: { apply } }));
    await user.click(screen.getByRole('button', { name: 'Mark applied' }));
    expect(screen.getByLabelText('CV used')).toHaveValue('cv-a');
    await user.click(screen.getByRole('button', { name: 'Save application' }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('job-1', 'Marked Frontend Engineer at Example BV as applied.'));
  });

  it('closes the apply dialog with Cancel and returns focus to the button', async () => {
    const user = userEvent.setup();
    renderWithApi(<JobCard job={job} documents={[CV]} onResolved={vi.fn()} />, createStubApi());
    const opener = screen.getByRole('button', { name: 'Mark applied' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe('JobDetailDialog', () => {
  function open(job = makeJob(), api = createStubApi()) {
    const onChanged = vi.fn();
    const onClose = vi.fn();
    renderWithApi(<JobDetailDialog job={job} documents={[CV]} onChanged={onChanged} onClose={onClose} />, api);
    return { onChanged, onClose };
  }

  it('shows the details and the description', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Frontend Engineer' });
    expect(within(dialog).getByText('Build accessible interfaces with React.')).toBeInTheDocument();
    expect(within(dialog).getByText('New')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /View posting/ })).toBeInTheDocument();
  });

  it('says when there is no description', () => {
    open(makeJob({ description: '' }));
    expect(screen.getByText('No description.')).toBeInTheDocument();
  });

  it('skips a new job, then reloads and closes', async () => {
    const user = userEvent.setup();
    const setStatus = vi.fn(() => Promise.resolve(makeJob({ status: 'skipped' })));
    const { onChanged, onClose } = open(makeJob(), createStubApi({ jobs: { setStatus } }));
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(setStatus).toHaveBeenCalledWith('job-1', 'skipped');
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('moves a skipped job back to New', async () => {
    const user = userEvent.setup();
    const setStatus = vi.fn(() => Promise.resolve(makeJob()));
    const { onChanged } = open(makeJob({ status: 'skipped' }), createStubApi({ jobs: { setStatus } }));
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move back to New' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(setStatus).toHaveBeenCalledWith('job-1', 'new');
  });

  it('points an applied job to the Applied page', () => {
    open(makeJob({ status: 'applied' }));
    expect(screen.getByText('Manage this application on the Applied page.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as applied' })).not.toBeInTheDocument();
  });

  it('shows the error of a failed status change and keeps the dialog', async () => {
    const user = userEvent.setup();
    const { onClose } = open(makeJob(), createStubApi({ jobs: { setStatus: vi.fn(() => rejection('forbidden', 'Not allowed')) } }));
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies through the nested dialog and closes both', async () => {
    const user = userEvent.setup();
    const apply = vi.fn(() => Promise.resolve(makeApplication()));
    const { onChanged, onClose } = open(makeJob(), createStubApi({ applications: { apply } }));
    await user.click(screen.getByRole('button', { name: 'Mark as applied' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Save application' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('can cancel the nested apply dialog', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('button', { name: 'Mark as applied' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

describe('JobsTable', () => {
  it('lists jobs and opens one from its title button', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const jobs = [makeJob(), makeJob({ id: 'job-2', title: 'Backend Engineer', status: 'skipped', category: 'B' })];
    renderWithApi(<JobsTable jobs={jobs} onOpen={onOpen} />, createStubApi());
    expect(screen.getByRole('table', { name: 'Jobs found' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(9);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Backend Engineer' }));
    expect(onOpen).toHaveBeenCalledWith(jobs[1]);
  });
});

describe('JobFiltersBar', () => {
  it('reports every filter change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onTimeChange = vi.fn();
    renderWithApi(
      <JobFiltersBar
        filters={{ status: '', q: '', sort: 'firstSeen', order: 'desc', page: 1 }}
        time={DEFAULT_TIME_FILTER}
        onChange={onChange}
        onTimeChange={onTimeChange}
      />,
      createStubApi(),
    );
    await user.selectOptions(screen.getByLabelText('Status'), 'applied');
    await user.selectOptions(screen.getByLabelText('Sort by'), 'fit');
    await user.selectOptions(screen.getByLabelText('Order'), 'asc');
    await user.click(screen.getByRole('button', { name: '7 days' }));
    expect(onChange).toHaveBeenNthCalledWith(1, { status: 'applied' });
    expect(onChange).toHaveBeenNthCalledWith(2, { sort: 'fit' });
    expect(onChange).toHaveBeenNthCalledWith(3, { order: 'asc' });
    expect(onTimeChange).toHaveBeenCalledWith({ range: '7d', from: '', to: '' });
  });

  it('commits the search text after a pause', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithApi(
      <JobFiltersBar
        filters={{ status: '', q: '', sort: 'firstSeen', order: 'desc', page: 1 }}
        time={DEFAULT_TIME_FILTER}
        onChange={onChange}
        onTimeChange={vi.fn()}
      />,
      createStubApi(),
    );
    await user.type(screen.getByRole('searchbox'), 'go');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ q: 'go' }));
  });
});
