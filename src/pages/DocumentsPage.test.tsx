import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  NOW,
  STANDARD_TEMPLATES,
  createStubApi,
  makeDocument,
  rejection,
  renderWithApi,
} from '../__fixtures__/uiFixtures';
import { DocumentsPage } from './DocumentsPage';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const CV = makeDocument({ id: 'cv-1', filename: 'my-cv.pdf', expiresAt: '2026-11-04T10:00:00.000Z' });
const LETTER = makeDocument({ id: 'letter-1', kind: 'letter', filename: 'my-letter.pdf' });
const TEMPLATE = makeDocument({ id: 'tpl-1', kind: 'template', filename: 'base-cv.docx', expiresAt: null });

function api(overrides: Parameters<typeof createStubApi>[0] = {}) {
  return createStubApi({
    documents: {
      list: vi.fn(() => Promise.resolve([CV, LETTER, TEMPLATE])),
      standardTemplates: vi.fn(() => Promise.resolve(STANDARD_TEMPLATES)),
    },
    ...overrides,
  });
}

describe('DocumentsPage', () => {
  it('shows the standard template, the upload form, the retention note and the documents', async () => {
    renderWithApi(<DocumentsPage />, api());
    expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toBeInTheDocument();
    expect(screen.getByText(/deleted automatically 6 months after upload/)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Download PDF/ })).toBeInTheDocument();
    expect(await screen.findByText('Templates: 1/3')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Your documents' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('Expires in 15 days')).toBeInTheDocument();
    expect(within(list).getByText('Never expires')).toBeInTheDocument();
  });

  it('filters the list by kind', async () => {
    const user = userEvent.setup();
    renderWithApi(<DocumentsPage />, api());
    await screen.findByRole('list', { name: 'Your documents' });
    await user.selectOptions(screen.getByLabelText('Show'), 'template');
    const items = within(screen.getByRole('list', { name: 'Your documents' })).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('base-cv.docx');
    await user.selectOptions(screen.getByLabelText('Show'), 'letter');
    expect(screen.getByRole('list', { name: 'Your documents' })).toHaveTextContent('my-letter.pdf');
    await user.selectOptions(screen.getByLabelText('Show'), 'all');
    expect(within(screen.getByRole('list', { name: 'Your documents' })).getAllByRole('listitem')).toHaveLength(3);
  });

  it('shows an empty state when there are no documents', async () => {
    renderWithApi(<DocumentsPage />, api({ documents: { list: vi.fn(() => Promise.resolve([])), standardTemplates: vi.fn(() => Promise.resolve([])) } }));
    expect(await screen.findByText('No documents')).toBeInTheDocument();
    expect(screen.getByText('Templates: 0/3')).toBeInTheDocument();
  });

  it('shows the error of the api and retries', async () => {
    const user = userEvent.setup();
    const list = vi.fn().mockImplementationOnce(() => rejection('network', 'Offline')).mockResolvedValueOnce([CV]);
    renderWithApi(<DocumentsPage />, api({ documents: { list, standardTemplates: vi.fn(() => Promise.resolve(STANDARD_TEMPLATES)) } }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Your documents' })).toBeInTheDocument();
  });

  it('downloads through a signed url in a new tab', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const signedUrl = vi.fn(() => Promise.resolve('https://storage.example.com/signed/my-cv.pdf'));
    renderWithApi(<DocumentsPage />, api({ documents: { list: vi.fn(() => Promise.resolve([CV])), signedUrl, standardTemplates: vi.fn(() => Promise.resolve([])) } }));
    await user.click(await screen.findByRole('button', { name: 'Download my-cv.pdf' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://storage.example.com/signed/my-cv.pdf', '_blank', 'noopener,noreferrer'));
    expect(signedUrl).toHaveBeenCalledWith('cv-1');
  });

  it('shows why a download failed', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderWithApi(
      <DocumentsPage />,
      api({
        documents: {
          list: vi.fn(() => Promise.resolve([CV])),
          signedUrl: vi.fn(() => rejection('not_found', 'The file is gone')),
          standardTemplates: vi.fn(() => Promise.resolve([])),
        },
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Download my-cv.pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The file is gone');
    expect(open).not.toHaveBeenCalled();
  });

  it('deletes a document after confirming and reloads', async () => {
    const user = userEvent.setup();
    const list = vi.fn().mockResolvedValueOnce([CV, LETTER]).mockResolvedValueOnce([LETTER]);
    const remove = vi.fn(() => Promise.resolve());
    renderWithApi(<DocumentsPage />, api({ documents: { list, remove, standardTemplates: vi.fn(() => Promise.resolve([])) } }));
    await user.click(await screen.findByRole('button', { name: 'Delete my-cv.pdf' }));
    await user.click(screen.getByRole('button', { name: 'Delete document' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(remove).toHaveBeenCalledWith('cv-1');
    await waitFor(() => expect(screen.queryByText('my-cv.pdf')).not.toBeInTheDocument());
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'Deleted my-cv.pdf.')).toBe(true);
  });

  it('can cancel a deletion', async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    renderWithApi(<DocumentsPage />, api({ documents: { list: vi.fn(() => Promise.resolve([CV])), remove, standardTemplates: vi.fn(() => Promise.resolve([])) } }));
    await user.click(await screen.findByRole('button', { name: 'Delete my-cv.pdf' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
  });

  it('uploads a template, reloads the list and updates the counter', async () => {
    const user = userEvent.setup();
    const uploaded = makeDocument({ id: 'tpl-2', kind: 'template', filename: 'second.pdf', expiresAt: null });
    const list = vi.fn().mockResolvedValueOnce([TEMPLATE]).mockResolvedValueOnce([TEMPLATE, uploaded]);
    const upload = vi.fn(() => Promise.resolve(uploaded));
    renderWithApi(<DocumentsPage />, api({ documents: { list, upload, standardTemplates: vi.fn(() => Promise.resolve([])) } }));
    expect(await screen.findByText('Templates: 1/3')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Type'), 'template');
    await user.upload(screen.getByLabelText(/File \(PDF or DOCX/), new File(['pdf'], 'second.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText('Templates: 2/3')).toBeInTheDocument();
    expect(upload).toHaveBeenCalledWith(expect.any(File), { kind: 'template' });
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'Uploaded second.pdf.')).toBe(true);
  });

  it('blocks a 4th template', async () => {
    const user = userEvent.setup();
    const three = [1, 2, 3].map((n) => makeDocument({ id: `tpl-${n}`, kind: 'template', filename: `t${n}.pdf`, expiresAt: null }));
    renderWithApi(<DocumentsPage />, api({ documents: { list: vi.fn(() => Promise.resolve(three)), standardTemplates: vi.fn(() => Promise.resolve([])) } }));
    expect(await screen.findByText('Templates: 3/3')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Type'), 'template');
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });
});
