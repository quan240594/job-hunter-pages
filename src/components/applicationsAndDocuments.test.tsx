import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  NOW,
  STANDARD_TEMPLATES,
  createStubApi,
  makeApplication,
  makeDocument,
  makeJob,
  rejection,
  renderWithApi,
} from '../__fixtures__/uiFixtures';
import { ApplicationsTable } from './ApplicationsTable';
import { DeleteDocumentDialog } from './DeleteDocumentDialog';
import { DocumentList } from './DocumentList';
import { ExpiryInfo, RetentionNote } from './ExpiryInfo';
import { StandardTemplateCard } from './StandardTemplateCard';
import { UploadForm } from './UploadForm';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const CV = makeDocument();
const OLD_CV = makeDocument({ id: 'cv-old', expiresAt: '2026-10-01T00:00:00.000Z' });
const LETTER = makeDocument({ id: 'letter-1', kind: 'letter', filename: 'letter-1.pdf' });

describe('ApplicationsTable', () => {
  const job = makeJob();
  const jobsById = new Map([[job.id, job]]);

  function renderTable(applications = [makeApplication()], documents = [CV, LETTER], onPatch = vi.fn(() => Promise.resolve(true))) {
    const onUndo = vi.fn();
    renderWithApi(
      <ApplicationsTable applications={applications} jobsById={jobsById} documents={documents} now={NOW} onPatch={onPatch} onUndo={onUndo} />,
      createStubApi(),
    );
    return { onPatch, onUndo };
  }

  it('shows the application with its job, CV and stage', () => {
    renderTable([makeApplication({ letterDocumentId: 'letter-1' })]);
    expect(screen.getByRole('table', { name: 'Applications' })).toBeInTheDocument();
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByText('10 Oct 2026')).toBeInTheDocument();
    expect(within(row).getByText('Example BV')).toBeInTheDocument();
    expect(within(row).getByText('Frontend Engineer')).toBeInTheDocument();
    expect(within(row).getByText('alex-example-cv.pdf')).toBeInTheDocument();
    expect(within(row).getByText('letter-1.pdf')).toBeInTheDocument();
    expect(within(row).queryByText('document expired')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Stage for Frontend Engineer at Example BV')).toHaveValue('applied');
  });

  it('flags a CV that no longer exists or has expired, keeping its label', () => {
    renderTable([makeApplication({ cvDocumentId: 'cv-old' }), makeApplication({ id: 'app-2', cvDocumentId: null })], [OLD_CV]);
    expect(screen.getAllByText('document expired')).toHaveLength(2);
    expect(screen.getAllByText('alex-example-cv.pdf')).toHaveLength(2);
  });

  it('says nothing was recorded, and copes with an unknown job', () => {
    renderWithApi(
      <ApplicationsTable
        applications={[makeApplication({ jobId: 'gone', cvDocumentId: null, cvLabel: '' })]}
        jobsById={jobsById}
        documents={[]}
        now={NOW}
        onPatch={vi.fn()}
        onUndo={vi.fn()}
      />,
      createStubApi(),
    );
    expect(screen.getAllByText('Not recorded')).toHaveLength(2);
    expect(screen.getByText('Unknown job')).toBeInTheDocument();
    expect(screen.getByLabelText('Stage for Unknown job')).toBeInTheDocument();
  });

  it('changes the stage', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderTable();
    await user.selectOptions(screen.getByLabelText('Stage for Frontend Engineer at Example BV'), 'interview');
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'app-1' }), { stage: 'interview' });
  });

  it('edits the notes, saving or cancelling', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderTable([makeApplication({ notes: 'first call' })], [CV], onPatch);
    expect(screen.getByText('first call')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit notes for Frontend Engineer at Example BV' }));
    const field = screen.getByLabelText('Notes for Frontend Engineer at Example BV');
    expect(field).toHaveFocus();
    expect(field).toHaveValue('first call');
    await user.clear(field);
    await user.type(field, '  second call ');
    await user.click(screen.getByRole('button', { name: 'Save notes' }));
    expect(onPatch).toHaveBeenLastCalledWith(expect.anything(), { notes: 'second call' });
    expect(screen.getByLabelText('Notes for Frontend Engineer at Example BV')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save notes' }));
    await waitFor(() => expect(screen.queryByLabelText('Notes for Frontend Engineer at Example BV')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit notes for Frontend Engineer at Example BV' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Edit notes for Frontend Engineer at Example BV' })).toBeInTheDocument();
  });

  it('shows a dash for empty notes and undoes an application', async () => {
    const user = userEvent.setup();
    const { onUndo } = renderTable();
    expect(screen.getByText('—')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo application for Frontend Engineer at Example BV' }));
    expect(onUndo).toHaveBeenCalledWith(expect.objectContaining({ id: 'app-1' }));
  });
});

describe('ExpiryInfo and RetentionNote', () => {
  it('says templates never expire', () => {
    render_(makeDocument({ kind: 'template', expiresAt: null }));
    expect(screen.getByText('Never expires')).toBeInTheDocument();
  });

  it('shows the date and the countdown of a healthy document', () => {
    render_(makeDocument({ expiresAt: '2027-01-01T00:00:00.000Z' }));
    expect(screen.getByText(/Expires on/)).toHaveTextContent('Expires on 1 Jan 2027 (in 73 days)');
    expect(screen.queryByText(/^Expires in/)).not.toBeInTheDocument();
  });

  it('warns below 30 days, in the singular too', () => {
    const { unmount } = render_(makeDocument({ expiresAt: '2026-11-04T10:00:00.000Z' }));
    expect(screen.getByText('Expires in 15 days')).toHaveClass('badge-warn');
    unmount();
    render_(makeDocument({ expiresAt: '2026-10-21T10:00:00.000Z' }));
    expect(screen.getByText('Expires in 1 day')).toBeInTheDocument();
  });

  it('flags a document past its date', () => {
    render_(makeDocument({ expiresAt: '2026-10-19T10:00:00.000Z' }));
    expect(screen.getByText('Expired, removed at the next cleanup')).toBeInTheDocument();
  });

  it('explains the 6 months retention', () => {
    renderWithApi(<RetentionNote />, createStubApi());
    expect(screen.getByText(/deleted automatically 6 months after upload/)).toBeInTheDocument();
    expect(screen.getByText(/Templates never expire/)).toBeInTheDocument();
  });

  function render_(doc: ReturnType<typeof makeDocument>) {
    return renderWithApi(<ExpiryInfo doc={doc} now={NOW} />, createStubApi());
  }
});

describe('DocumentList', () => {
  it('lists documents with kind, size, expiry and actions', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    const onDelete = vi.fn();
    const template = makeDocument({ id: 'tpl', kind: 'template', filename: 'base.docx', expiresAt: null, sizeBytes: 2048 });
    const dated = makeDocument({ createdAt: '2026-10-02T10:00:00.000Z' });
    renderWithApi(<DocumentList documents={[dated, template]} now={NOW} busy={false} onDownload={onDownload} onDelete={onDelete} />, createStubApi());
    const items = within(screen.getByRole('list', { name: 'Your documents' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('117.2 KB · uploaded 2 Oct 2026')).toBeInTheDocument();
    expect(within(items[1]).getByText('Template')).toBeInTheDocument();
    expect(within(items[1]).getByText('Never expires')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Download alex-example-cv.pdf' }));
    await user.click(screen.getByRole('button', { name: 'Delete base.docx' }));
    expect(onDownload).toHaveBeenCalledWith(dated);
    expect(onDelete).toHaveBeenCalledWith(template);
  });

  it('disables the actions while busy', () => {
    renderWithApi(<DocumentList documents={[CV]} now={NOW} busy onDownload={vi.fn()} onDelete={vi.fn()} />, createStubApi());
    expect(screen.getByRole('button', { name: 'Download alex-example-cv.pdf' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete alex-example-cv.pdf' })).toBeDisabled();
  });
});

describe('UploadForm', () => {
  const pdf = () => new File(['pdf'], 'my-cv.pdf', { type: 'application/pdf' });

  it('shows the template counter and uploads a CV by default', async () => {
    const user = userEvent.setup();
    const uploaded = makeDocument({ filename: 'my-cv.pdf' });
    const upload = vi.fn(() => Promise.resolve(uploaded));
    const onUploaded = vi.fn();
    renderWithApi(<UploadForm templateCount={1} onUploaded={onUploaded} />, createStubApi({ documents: { upload } }));
    expect(screen.getByRole('status')).toHaveTextContent('Templates: 1/3');
    const file = pdf();
    await user.upload(screen.getByLabelText(/File \(PDF or DOCX/), file);
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(uploaded));
    expect(upload).toHaveBeenCalledWith(file, { kind: 'cv' });
    expect(screen.getByLabelText(/File \(PDF or DOCX/)).toHaveValue('');
  });

  it('uploads a letter or a template with the chosen kind', async () => {
    const user = userEvent.setup();
    const upload = vi.fn(() => Promise.resolve(makeDocument()));
    renderWithApi(<UploadForm templateCount={2} onUploaded={vi.fn()} />, createStubApi({ documents: { upload } }));
    await user.selectOptions(screen.getByLabelText('Type'), 'template');
    await user.upload(screen.getByLabelText(/File \(PDF or DOCX/), pdf());
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(upload).toHaveBeenCalledWith(expect.any(File), { kind: 'template' }));
  });

  it('disables uploading a 4th template and explains why', async () => {
    const user = userEvent.setup();
    renderWithApi(<UploadForm templateCount={3} onUploaded={vi.fn()} />, createStubApi());
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
    await user.selectOptions(screen.getByLabelText('Type'), 'template');
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(screen.getByText(/You have 3 templates/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Type'), 'letter');
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
  });

  it('shows the template_limit error of the api', async () => {
    const user = userEvent.setup();
    renderWithApi(
      <UploadForm templateCount={2} onUploaded={vi.fn()} />,
      createStubApi({ documents: { upload: vi.fn(() => rejection('template_limit', 'You can keep at most 3 templates')) } }),
    );
    await user.selectOptions(screen.getByLabelText('Type'), 'template');
    await user.upload(screen.getByLabelText(/File \(PDF or DOCX/), pdf());
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You can keep at most 3 templates');
  });

  it('asks for a file and rejects a wrong type or a big file before calling the api', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const upload = vi.fn();
    renderWithApi(<UploadForm templateCount={0} onUploaded={vi.fn()} />, createStubApi({ documents: { upload } }));
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a file to upload.');
    await user.upload(screen.getByLabelText(/File \(PDF or DOCX/), new File(['x'], 'photo.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Only PDF or DOCX files can be uploaded.');
    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    await user.upload(screen.getByLabelText(/File \(PDF or DOCX/), big);
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The file is 11.0 MB; the maximum is 10 MB.');
    expect(upload).not.toHaveBeenCalled();
  });

  it('shows progress while uploading', async () => {
    const user = userEvent.setup();
    renderWithApi(
      <UploadForm templateCount={0} onUploaded={vi.fn()} />,
      createStubApi({ documents: { upload: vi.fn(() => new Promise<never>(() => undefined)) } }),
    );
    await user.upload(screen.getByLabelText(/File \(PDF or DOCX/), pdf());
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByRole('button', { name: 'Uploading…' })).toBeDisabled();
  });

  it('treats a cleared file chooser as no file', async () => {
    const user = userEvent.setup();
    renderWithApi(<UploadForm templateCount={0} onUploaded={vi.fn()} />, createStubApi());
    const input = screen.getByLabelText(/File \(PDF or DOCX/);
    await user.upload(input, pdf());
    await user.upload(input, []);
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a file to upload.');
  });
});

describe('StandardTemplateCard', () => {
  it('shows the built-in reference with download links and a note that it does not count', async () => {
    renderWithApi(
      <StandardTemplateCard />,
      createStubApi({ documents: { standardTemplates: vi.fn(() => Promise.resolve(STANDARD_TEMPLATES)) } }),
    );
    expect(screen.getByRole('heading', { name: 'Standard CV template', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/does not count toward your 3 templates/)).toBeInTheDocument();
    const pdf = await screen.findByRole('link', { name: /Download PDF/ });
    expect(pdf).toHaveAttribute('href', new URL('templates/standard-cv-template.pdf', document.baseURI).href);
    expect(pdf).toHaveAttribute('download');
    expect(screen.getByRole('link', { name: /Download DOCX/ })).toBeInTheDocument();
    expect(screen.getByText('One-page reference layout.')).toBeInTheDocument();
  });

  it('drops links that are not http(s)', async () => {
    const unsafe = { ...STANDARD_TEMPLATES[0], pdfUrl: 'javascript:alert(1)' };
    renderWithApi(<StandardTemplateCard />, createStubApi({ documents: { standardTemplates: vi.fn(() => Promise.resolve([unsafe])) } }));
    expect(await screen.findByRole('link', { name: /Download DOCX/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Download PDF/ })).not.toBeInTheDocument();
  });

  it('shows the error when the templates cannot be loaded', async () => {
    renderWithApi(
      <StandardTemplateCard />,
      createStubApi({ documents: { standardTemplates: vi.fn(() => rejection('network', 'Offline')) } }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  });
});

describe('DeleteDocumentDialog', () => {
  it('asks for confirmation, deletes and reports', async () => {
    const user = userEvent.setup();
    const remove = vi.fn(() => Promise.resolve());
    const onDeleted = vi.fn();
    renderWithApi(<DeleteDocumentDialog doc={CV} onDeleted={onDeleted} onClose={vi.fn()} />, createStubApi({ documents: { remove } }));
    expect(screen.getByRole('dialog', { name: 'Delete this document?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete document' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(CV));
    expect(remove).toHaveBeenCalledWith('doc-cv');
  });

  it('shows a failure and can be cancelled', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithApi(
      <DeleteDocumentDialog doc={CV} onDeleted={vi.fn()} onClose={onClose} />,
      createStubApi({ documents: { remove: vi.fn(() => rejection('not_found', 'Already gone')) } }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete document' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Already gone');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
