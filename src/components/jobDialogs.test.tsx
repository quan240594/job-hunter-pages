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
import { AddJobDialog } from './AddJobDialog';
import { ApplyDialog } from './ApplyDialog';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const CV_A = makeDocument({ id: 'cv-a', filename: 'cv-a.pdf' });
const CV_B = makeDocument({ id: 'cv-b', filename: 'cv-b.pdf' });
const CV_OLD = makeDocument({ id: 'cv-old', filename: 'cv-old.pdf', expiresAt: '2026-10-01T00:00:00.000Z' });
const LETTER = makeDocument({ id: 'letter-1', kind: 'letter', filename: 'letter-1.pdf' });
const TEMPLATE = makeDocument({ id: 'tpl-1', kind: 'template', filename: 'template-1.pdf', expiresAt: null });

describe('ApplyDialog', () => {
  const job = makeJob({ recommendedDocumentIds: ['cv-b', 'letter-1'] });
  const documents = [CV_A, CV_B, CV_OLD, LETTER, TEMPLATE];

  it('offers live CVs and letters only, preselects the recommended ones and saves the application', async () => {
    const user = userEvent.setup();
    const application = makeApplication();
    const apply = vi.fn(() => Promise.resolve(application));
    const onApplied = vi.fn();
    renderWithApi(<ApplyDialog job={job} documents={documents} onApplied={onApplied} onClose={vi.fn()} />, createStubApi({ applications: { apply } }));

    expect(screen.getByRole('dialog', { name: 'Mark as applied: Frontend Engineer at Example BV' })).toBeInTheDocument();
    const cv = screen.getByLabelText('CV used');
    expect(within(cv).getAllByRole('option').map((option) => option.textContent)).toEqual(['No CV recorded', 'cv-a.pdf', 'cv-b.pdf']);
    expect(cv).toHaveValue('cv-b');
    expect(screen.getByLabelText('Cover letter used')).toHaveValue('letter-1');

    await user.selectOptions(cv, 'cv-a');
    await user.type(screen.getByLabelText('Notes'), '  referral from Sam ');
    await user.click(screen.getByRole('button', { name: 'Save application' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(application));
    expect(apply).toHaveBeenCalledWith({
      jobId: 'job-1',
      cvDocumentId: 'cv-a',
      letterDocumentId: 'letter-1',
      cvLabel: 'cv-a.pdf',
      notes: 'referral from Sam',
    });
  });

  it('starts empty without recommendations and can record no documents', async () => {
    const user = userEvent.setup();
    const apply = vi.fn(() => Promise.resolve(makeApplication()));
    renderWithApi(
      <ApplyDialog job={makeJob()} documents={[CV_A]} onApplied={vi.fn()} onClose={vi.fn()} />,
      createStubApi({ applications: { apply } }),
    );
    expect(screen.getByLabelText('CV used')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Save application' }));
    await waitFor(() =>
      expect(apply).toHaveBeenCalledWith({ jobId: 'job-1', cvDocumentId: null, letterDocumentId: null, cvLabel: '', notes: '' }),
    );
  });

  it('shows the error of the api and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const onApplied = vi.fn();
    renderWithApi(
      <ApplyDialog job={job} documents={documents} onApplied={onApplied} onClose={vi.fn()} />,
      createStubApi({ applications: { apply: vi.fn(() => rejection('conflict', 'Already applied')) } }),
    );
    await user.click(screen.getByRole('button', { name: 'Save application' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Already applied');
    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save application' })).toBeEnabled();
  });

  it('shows progress while saving and closes with Cancel', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithApi(
      <ApplyDialog job={job} documents={documents} onApplied={vi.fn()} onClose={onClose} />,
      createStubApi({ applications: { apply: vi.fn(() => new Promise<never>(() => undefined)) } }),
    );
    await user.click(screen.getByRole('button', { name: 'Save application' }));
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('AddJobDialog', () => {
  function fill(user: ReturnType<typeof userEvent.setup>, values: Record<string, string>): Promise<void> {
    return Object.entries(values).reduce(
      (chain, [label, value]) => chain.then(() => user.type(screen.getByLabelText(new RegExp(label)), value)),
      Promise.resolve(),
    );
  }

  it('is a labelled dialog that focuses the first field', () => {
    renderWithApi(<AddJobDialog onAdded={vi.fn()} onClose={vi.fn()} />, createStubApi());
    expect(screen.getByRole('dialog', { name: 'Add a job manually' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Job title/)).toHaveFocus();
  });

  it('adds the job with trimmed values and an optional link', async () => {
    const user = userEvent.setup();
    const created = makeJob({ id: 'manual-1', source: 'manual' });
    const addManual = vi.fn(() => Promise.resolve(created));
    const onAdded = vi.fn();
    renderWithApi(<AddJobDialog onAdded={onAdded} onClose={vi.fn()} />, createStubApi({ jobs: { addManual } }));
    await fill(user, {
      'Job title': ' Backend Engineer ',
      Company: 'Example BV',
      Location: 'Rotterdam',
      'Link to the posting': ' https://jobs.example.com/backend ',
      Description: ' Build APIs ',
    });
    await user.click(screen.getByRole('button', { name: 'Add job' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(created));
    expect(addManual).toHaveBeenCalledWith({
      title: 'Backend Engineer',
      company: 'Example BV',
      location: 'Rotterdam',
      description: 'Build APIs',
      url: 'https://jobs.example.com/backend',
    });
  });

  it('leaves the link out when empty', async () => {
    const user = userEvent.setup();
    const addManual = vi.fn(() => Promise.resolve(makeJob()));
    renderWithApi(<AddJobDialog onAdded={vi.fn()} onClose={vi.fn()} />, createStubApi({ jobs: { addManual } }));
    await fill(user, { 'Job title': 'A', Company: 'B', Location: 'C' });
    await user.click(screen.getByRole('button', { name: 'Add job' }));
    await waitFor(() => expect(addManual).toHaveBeenCalledWith({ title: 'A', company: 'B', location: 'C', description: '' }));
  });

  it('validates required fields and the link before calling the api', async () => {
    const user = userEvent.setup();
    const addManual = vi.fn();
    renderWithApi(<AddJobDialog onAdded={vi.fn()} onClose={vi.fn()} />, createStubApi({ jobs: { addManual } }));
    await user.click(screen.getByRole('button', { name: 'Add job' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Title, company and location are required.');
    await fill(user, { 'Job title': 'A', Company: 'B', Location: 'C', 'Link to the posting': 'not a link' });
    await user.click(screen.getByRole('button', { name: 'Add job' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The link must start with http:// or https://.');
    expect(addManual).not.toHaveBeenCalled();
  });

  it('shows the conflict of a duplicate job', async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    renderWithApi(
      <AddJobDialog onAdded={onAdded} onClose={vi.fn()} />,
      createStubApi({ jobs: { addManual: vi.fn(() => rejection('conflict', 'This job already exists')) } }),
    );
    await fill(user, { 'Job title': 'A', Company: 'B', Location: 'C' });
    await user.click(screen.getByRole('button', { name: 'Add job' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This job already exists');
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('shows progress and can be cancelled', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithApi(
      <AddJobDialog onAdded={vi.fn()} onClose={onClose} />,
      createStubApi({ jobs: { addManual: vi.fn(() => new Promise<never>(() => undefined)) } }),
    );
    await fill(user, { 'Job title': 'A', Company: 'B', Location: 'C' });
    await user.click(screen.getByRole('button', { name: 'Add job' }));
    expect(await screen.findByRole('button', { name: 'Adding…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
