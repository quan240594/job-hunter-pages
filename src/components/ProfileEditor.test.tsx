import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStubApi, makeProfile, rejection, renderWithApi } from '../__fixtures__/uiFixtures';
import { draftFromProfile, emptyLanguage, emptyLink } from '../lib/profile';
import { ProfileEditor } from './ProfileEditor';
import { CvPreview } from './profile/CvPreview';
import { RepeatableList } from './profile/RepeatableList';

describe('RepeatableList', () => {
  it('adds and removes rows with accessible labels', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    render(
      <RepeatableList legend="Things" itemLabel="Thing" items={[{ key: 'a' }, { key: 'b' }]} addLabel="Add thing" onAdd={onAdd} onRemove={onRemove}>
        {(item) => <p>Row {item.key}</p>}
      </RepeatableList>,
    );
    expect(screen.getByRole('group', { name: 'Things' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Thing 2' })).toHaveTextContent('Row b');
    await user.click(screen.getByRole('button', { name: 'Remove thing 2' }));
    await user.click(screen.getByRole('button', { name: 'Add thing' }));
    expect(onRemove).toHaveBeenCalledWith('b');
    expect(onAdd).toHaveBeenCalledOnce();
  });
});

describe('CvPreview', () => {
  it('prints a complete CV from the form state', () => {
    render(<CvPreview draft={draftFromProfile(makeProfile())} />);
    const cv = screen.getByRole('article', { name: 'CV preview' });
    expect(within(cv).getByRole('heading', { name: 'Alex Example', level: 3 })).toBeInTheDocument();
    expect(within(cv).getByText('Software engineer')).toBeInTheDocument();
    expect(within(cv).getByText('alex@example.com · +31 6 0000 0000 · Amsterdam')).toBeInTheDocument();
    expect(within(cv).getByText('Builds reliable web apps.')).toBeInTheDocument();
    expect(within(cv).getByText('2021-03 – Present')).toBeInTheDocument();
    expect(within(cv).getByText('Built a design system')).toBeInTheDocument();
    expect(within(cv).getByText('react')).toBeInTheDocument();
    expect(within(cv).queryByText('kubernetes')).not.toBeInTheDocument();
    expect(within(cv).getByText('BSc Computer Science')).toBeInTheDocument();
    expect(within(cv).getByText('2014-09 – 2018-06')).toBeInTheDocument();
    expect(within(cv).getByText('English (C1)')).toBeInTheDocument();
    expect(within(cv).getByRole('link', { name: 'Portfolio' })).toHaveAttribute('href', 'https://alex.example.com/');
  });

  it('leaves out empty sections, falls back to the display name and shows unsafe links as text', () => {
    const draft = draftFromProfile(null);
    draft.displayName = 'Alex';
    draft.languages = [{ ...emptyLanguage(), name: 'Dutch' }];
    draft.links = [{ ...emptyLink(), label: 'Broken', url: 'javascript:alert(1)' }];
    render(<CvPreview draft={draft} />);
    expect(screen.getByRole('heading', { name: 'Alex' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Experience' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Education' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Skills' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Profile' })).not.toBeInTheDocument();
    expect(screen.getByText('Dutch')).toBeInTheDocument();
    expect(screen.getByText('Broken')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('ProfileEditor', () => {
  function fieldIn(group: string, label: string) {
    return within(screen.getByRole('group', { name: group })).getByLabelText(new RegExp(`^${label}`));
  }

  it('starts empty for a new user, validates and then saves', async () => {
    const user = userEvent.setup();
    const saved = makeProfile({ updatedAt: '2026-10-20T10:00:00.000Z' });
    const save = vi.fn(() => Promise.resolve(saved));
    renderWithApi(<ProfileEditor profile={null} />, createStubApi({ profile: { save } }));
    expect(screen.getByText('Not saved yet.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Cities/)).toHaveValue('Amsterdam, Rotterdam, Den Haag');

    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Display name is required.');
    expect(screen.getByRole('alert')).toHaveTextContent('Contact name is required.');
    expect(save).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Display name/), 'Alex');
    await user.type(screen.getByLabelText(/Name on the CV/), 'Alex Example');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(screen.getByText('Last saved 20 Oct 2026.')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Alex',
        cv: expect.objectContaining({ contact: expect.objectContaining({ name: 'Alex Example' }) }),
      }),
    );
  });

  it('shows a stored profile and a live preview that follows edits', async () => {
    const user = userEvent.setup();
    renderWithApi(<ProfileEditor profile={makeProfile()} />, createStubApi());
    expect(screen.getByLabelText(/Display name/)).toHaveValue('Alex Example');
    expect(screen.getByText('Last saved 1 Oct 2026.')).toBeInTheDocument();
    const preview = screen.getByRole('article', { name: 'CV preview' });
    await user.clear(screen.getByLabelText('Headline'));
    await user.type(screen.getByLabelText('Headline'), 'Staff engineer');
    expect(within(preview).getByText('Staff engineer')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Summary'), ' Loves a11y.');
    expect(within(preview).getByText('Builds reliable web apps. Loves a11y.')).toBeInTheDocument();
  });

  it('edits experience, education, languages and links, adding and removing rows', async () => {
    const user = userEvent.setup();
    const save = vi.fn((input) => Promise.resolve({ ...makeProfile(), ...input }));
    renderWithApi(<ProfileEditor profile={makeProfile()} />, createStubApi({ profile: { save } }));

    await user.type(fieldIn('Experience 1', 'Role'), ' Lead');
    await user.type(fieldIn('Experience 1', 'Company'), ' Group');
    await user.type(fieldIn('Experience 1', 'Location'), ' NL');
    await user.type(fieldIn('Experience 1', 'Start date'), '-15');
    await user.type(fieldIn('Experience 1', 'End date'), '2024-01');
    await user.type(fieldIn('Experience 1', 'Highlights'), '\nShipped v2');
    await user.type(fieldIn('Education 1', 'Degree'), ' (Hons)');
    await user.type(fieldIn('Education 1', 'School'), ' Utrecht');
    await user.type(fieldIn('Education 1', 'Location'), ' NL');
    await user.type(fieldIn('Education 1', 'Start date'), '-01');
    await user.type(fieldIn('Education 1', 'End date'), '-15');
    await user.type(fieldIn('Language 1', 'Level'), '+');
    await user.type(fieldIn('Language 1', 'Language'), ' (UK)');
    await user.type(fieldIn('Link 1', 'Label'), ' site');
    await user.type(fieldIn('Link 1', 'URL'), '/about');

    await user.click(screen.getByRole('button', { name: 'Add experience' }));
    await user.click(screen.getByRole('button', { name: 'Add education' }));
    await user.click(screen.getByRole('button', { name: 'Add language' }));
    await user.click(screen.getByRole('button', { name: 'Add link' }));
    expect(screen.getByRole('group', { name: 'Experience 2' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Education 2' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Language 2' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Link 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove experience 2' }));
    await user.click(screen.getByRole('button', { name: 'Remove education 2' }));
    await user.click(screen.getByRole('button', { name: 'Remove language 2' }));
    await user.click(screen.getByRole('button', { name: 'Remove link 2' }));
    expect(screen.queryByRole('group', { name: 'Experience 2' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const [sent] = save.mock.calls[0] as unknown as [ReturnType<typeof makeProfile>];
    expect(sent.cv.experience[0]).toMatchObject({
      role: 'Engineer Lead',
      company: 'Example BV Group',
      location: 'Amsterdam NL',
      startDate: '2021-03-15',
      endDate: '2024-01',
      bullets: ['Built a design system', 'Cut load time by half', 'Shipped v2'],
    });
    expect(sent.cv.education[0]).toMatchObject({ degree: 'BSc Computer Science (Hons)', startDate: '2014-09-01', endDate: '2018-06-15' });
    expect(sent.cv.languages).toEqual([{ name: 'English (UK)', level: 'C1+' }]);
    expect(sent.cv.links).toEqual([{ label: 'Portfolio site', url: 'https://alex.example.com/about' }]);
  });

  it('adds experience and education rows to an empty profile and reports their problems', async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    renderWithApi(<ProfileEditor profile={null} />, createStubApi({ profile: { save } }));
    await user.type(screen.getByLabelText(/Display name/), 'Alex');
    await user.type(screen.getByLabelText(/Name on the CV/), 'Alex Example');
    await user.type(screen.getByLabelText('Email'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Add experience' }));
    await user.click(screen.getByRole('button', { name: 'Add education' }));
    await user.click(screen.getByRole('button', { name: 'Add language' }));
    await user.click(screen.getByRole('button', { name: 'Add link' }));
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Contact email is not a valid address.');
    expect(alert).toHaveTextContent('Experience 1: role is required.');
    expect(alert).toHaveTextContent('Education 1: school is required.');
    expect(alert).toHaveTextContent('Language 1: name is required.');
    expect(alert).toHaveTextContent('Link 1: the URL must start with http:// or https://.');
    expect(save).not.toHaveBeenCalled();
  });

  it('edits contact details, skills and search settings and states that scraping is a later phase', async () => {
    const user = userEvent.setup();
    const save = vi.fn((input) => Promise.resolve({ ...makeProfile(), ...input }));
    renderWithApi(<ProfileEditor profile={makeProfile()} />, createStubApi({ profile: { save } }));
    expect(screen.getByText(/Automated job scraping per user comes in a later phase/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Phone'), '1');
    await user.type(within(screen.getByRole('group', { name: 'About you' })).getByLabelText('Location'), ' NL');
    await user.type(screen.getByLabelText(/Skills you have/), ', Go');
    await user.type(screen.getByLabelText(/Skills you lack/), ', rust');
    await user.type(screen.getByLabelText(/Keywords/), ', design systems');
    await user.type(screen.getByLabelText(/Cities/), ', Utrecht');
    await user.selectOptions(screen.getByLabelText('Remote preference'), 'any');
    await user.selectOptions(screen.getByLabelText('Minimum seniority'), 'senior');
    await user.click(screen.getByRole('checkbox', { name: 'English-language postings only' }));
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const [sent] = save.mock.calls[0] as unknown as [ReturnType<typeof makeProfile>];
    expect(sent.cv.contact).toMatchObject({ phone: '+31 6 0000 00001', location: 'Amsterdam NL' });
    expect(sent.cv.skills).toEqual({ has: ['react', 'typescript', 'go'], lacks: ['kubernetes', 'rust'] });
    expect(sent.searchSettings).toEqual({
      keywords: ['frontend', 'design systems'],
      cities: ['Amsterdam', 'Rotterdam', 'Utrecht'],
      remote: 'any',
      englishOnly: false,
      minSeniority: 'senior',
    });
  });

  it('shows the error of a failed save and the saving state', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockImplementationOnce(() => rejection('network', 'Offline')).mockImplementationOnce(() => new Promise(() => undefined));
    renderWithApi(<ProfileEditor profile={makeProfile()} />, createStubApi({ profile: { save } }));
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('prints the CV preview', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderWithApi(<ProfileEditor profile={makeProfile()} />, createStubApi());
    await user.click(screen.getByRole('button', { name: 'Print CV' }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });

  it('keeps the form out of the printout', () => {
    renderWithApi(<ProfileEditor profile={makeProfile()} />, createStubApi());
    expect(screen.getByRole('form', { name: 'Profile' })).toHaveClass('no-print');
  });
});
