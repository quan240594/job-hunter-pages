import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { makeDocument, makeJob } from '../__fixtures__/uiFixtures';
import type { Role } from '../api';
import type { AsyncState } from '../hooks/useAsync';
import { CUSTOM, DEFAULT_TIME_FILTER } from '../lib/timeFilter';
import type { TimeFilterValue } from '../lib/timeFilter';
import { Badge, CategoryBadge, RoleBadge, StageBadge, StatusBadge } from './Badge';
import { Chip, ChipList, ToggleChip } from './Chip';
import { DataState } from './DataState';
import { DocumentSelect } from './DocumentSelect';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { SelectField, TextAreaField, TextField } from './Field';
import { FitStars } from './FitStars';
import { Fact, JobFacts, JobLink } from './JobFacts';
import { Pagination } from './Pagination';
import { DEBOUNCE_MS, SearchBox } from './SearchBox';
import { Spinner } from './Spinner';
import { TimeFilter } from './TimeFilter';

const ADMIN: Role = 'admin';
const USER: Role = 'user';

function state<T>(overrides: Partial<AsyncState<T>>): AsyncState<T> {
  return { status: 'success', data: undefined, error: null, refreshing: false, reload: vi.fn(), setData: vi.fn(), ...overrides };
}

describe('badges', () => {
  it('renders tones, statuses, stages, roles and categories with accessible text', () => {
    render(
      <>
        <Badge tone="good" title="Hint">
          Plain
        </Badge>
        <StatusBadge status="skipped" />
        <StageBadge stage="interview" />
        <RoleBadge role={ADMIN} />
        <RoleBadge role={USER} />
        <CategoryBadge category="B" />
        <CategoryBadge category="A" withLabel />
      </>,
    );
    expect(screen.getByText('Plain')).toHaveClass('badge-good');
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Interview')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Dutch needed')).toHaveClass('visually-hidden');
    expect(screen.getByText('A · Qualified')).toBeInTheDocument();
  });
});

describe('chips', () => {
  it('lists chips and toggles pressed state', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <>
        <ChipList label="Tags">
          <Chip>One</Chip>
          <Chip tone="info">Two</Chip>
        </ChipList>
        <ToggleChip pressed onToggle={onToggle} title="Pick">
          Pick me
        </ToggleChip>
      </>,
    );
    expect(screen.getByRole('list', { name: 'Tags' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const toggle = screen.getByRole('button', { name: 'Pick me' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

describe('states', () => {
  it('shows a spinner as a status', () => {
    render(<Spinner label="Loading things…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading things…');
  });

  it('shows an empty state with optional hint and children', () => {
    render(
      <EmptyState title="Nothing here" hint="Add something">
        <button type="button">Add</button>
      </EmptyState>,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Add something')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('shows an empty state without a hint', () => {
    render(<EmptyState title="Bare" />);
    expect(screen.getByText('Bare')).toBeInTheDocument();
  });

  it('shows an error as an alert with an optional retry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState message="Server said no" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Server said no');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<ErrorState message="No retry" title="Custom title" />);
    expect(screen.getByText('Custom title')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('DataState renders loading, error and data', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const { rerender } = render(<DataState state={state<string>({ status: 'loading' })}>{(data) => <p>{data}</p>}</DataState>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    rerender(
      <DataState state={state<string>({ status: 'error', error: 'Broken', reload })} loadingLabel="Wait">
        {(data) => <p>{data}</p>}
      </DataState>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Broken');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledOnce();
    rerender(<DataState state={state({ data: 'Loaded', refreshing: true })}>{(data) => <p>{data}</p>}</DataState>);
    expect(screen.getByText('Loaded').parentElement).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Pagination', () => {
  it('shows the range and moves between pages', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={50} total={120} onPageChange={onPageChange} />);
    expect(screen.getByText('51–100 of 120 · page 2 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it('disables the buttons at the ends and copes with no items', () => {
    const { rerender } = render(<Pagination page={1} pageSize={50} total={10} onPageChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    rerender(<Pagination page={1} pageSize={50} total={0} onPageChange={() => undefined} />);
    expect(screen.getByText('0–0 of 0 · page 1 of 1')).toBeInTheDocument();
  });
});

describe('FitStars', () => {
  it('hides the stars from screen readers and says the fit in words', () => {
    render(
      <>
        <FitStars fit={4} />
        <FitStars fit={0} />
      </>,
    );
    expect(screen.getByText('Fit 4 out of 5')).toHaveClass('visually-hidden');
    expect(screen.getByText('Fit not scored')).toBeInTheDocument();
    expect(screen.getByText('★★★★☆')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('fields', () => {
  it('TextField reports changes, marks required fields and can take dialog focus', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TextField label="Company" value="" onChange={onChange} required placeholder="Acme" dialogAutofocus />);
    const input = screen.getByLabelText(/Company/);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('data-autofocus');
    await user.type(input, 'A');
    expect(onChange).toHaveBeenCalledWith('A');
  });

  it('TextField is optional by default', () => {
    render(<TextField label="Phone" type="tel" value="1" onChange={() => undefined} />);
    expect(screen.getByLabelText('Phone')).not.toBeRequired();
    expect(screen.getByLabelText('Phone')).not.toHaveAttribute('data-autofocus');
  });

  it('TextAreaField and SelectField report changes', async () => {
    const user = userEvent.setup();
    const onText = vi.fn();
    const onSelect = vi.fn();
    render(
      <>
        <TextAreaField label="Notes" value="" onChange={onText} hint="Anything" />
        <SelectField
          label="Pick"
          value="a"
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ]}
          onChange={onSelect}
        />
      </>,
    );
    await user.type(screen.getByLabelText('Notes'), 'x');
    await user.selectOptions(screen.getByLabelText('Pick'), 'b');
    expect(onText).toHaveBeenCalledWith('x');
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('DocumentSelect lists file names with an empty choice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DocumentSelect label="CV used" documents={[makeDocument()]} value="" onChange={onChange} emptyLabel="No CV recorded" />,
    );
    expect(screen.getByRole('option', { name: 'No CV recorded' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('CV used'), 'alex-example-cv.pdf');
    expect(onChange).toHaveBeenCalledWith('doc-cv');
  });
});

describe('TimeFilter', () => {
  function Harness({ start = DEFAULT_TIME_FILTER }: Readonly<{ start?: TimeFilterValue }>) {
    const [value, setValue] = useState(start);
    return <TimeFilter basis="first seen" value={value} onChange={setValue} />;
  }

  it('offers the presets and a custom range', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Time range (first seen)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('From date')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '30 days' }));
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByLabelText('From date')).toBeInTheDocument();
  });

  it('keeps the custom dates consistent', () => {
    render(<Harness start={{ range: CUSTOM, from: '2026-01-01', to: '2026-02-01' }} />);
    const from = screen.getByLabelText('From date');
    const to = screen.getByLabelText('To date');
    expect(from).toHaveAttribute('max', '2026-02-01');
    expect(to).toHaveAttribute('min', '2026-01-01');
    fireEvent.change(from, { target: { value: '2026-01-10' } });
    fireEvent.change(to, { target: { value: '2026-03-01' } });
    expect(from).toHaveValue('2026-01-10');
    expect(to).toHaveValue('2026-03-01');
  });

  it('has no limits on an open custom range', () => {
    render(<Harness start={{ range: CUSTOM, from: '', to: '' }} />);
    expect(screen.getByLabelText('From date')).not.toHaveAttribute('max');
    expect(screen.getByLabelText('To date')).not.toHaveAttribute('min');
  });
});

describe('SearchBox', () => {
  afterEach(() => vi.useRealTimers());

  it('commits the typed text once typing paused', () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    render(<SearchBox value="" onCommit={onCommit} />);
    const input = screen.getByRole('searchbox', { name: 'Search' });
    fireEvent.change(input, { target: { value: 're' } });
    fireEvent.change(input, { target: { value: 'react' } });
    act(() => vi.advanceTimersByTime(DEBOUNCE_MS - 1));
    expect(onCommit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('react');
  });

  it('does not commit an unchanged value and follows the value prop', () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    const { rerender } = render(<SearchBox value="go" onCommit={onCommit} />);
    act(() => vi.advanceTimersByTime(DEBOUNCE_MS * 2));
    expect(onCommit).not.toHaveBeenCalled();
    rerender(<SearchBox value="rust" onCommit={onCommit} />);
    expect(screen.getByRole('searchbox')).toHaveValue('rust');
  });
});

describe('JobFacts and JobLink', () => {
  it('shows the facts of a scored job', () => {
    render(<JobFacts job={makeJob({ postedAt: '2026-10-15T00:00:00.000Z' })} />);
    expect(screen.getByText('Amsterdam')).toBeInTheDocument();
    expect(screen.getByText('Hybrid or remote quoted')).toBeInTheDocument();
    expect(screen.getByText('“Two days per week in the office”')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('greenhouse:example')).toBeInTheDocument();
    expect(screen.getByText('15 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('18 Oct 2026')).toBeInTheDocument();
  });

  it('credits Adzuna for Adzuna jobs and labels Jooble neutrally', () => {
    const { rerender } = render(<JobFacts job={makeJob({ source: 'adzuna' })} />);
    expect(screen.getByRole('link', { name: /Jobs by Adzuna/ })).toHaveAttribute('href', 'https://www.adzuna.nl/');
    rerender(<JobFacts job={makeJob({ source: 'jooble' })} />);
    expect(screen.queryByRole('link', { name: /Jobs by Adzuna/ })).not.toBeInTheDocument();
    expect(screen.getByText('via Jooble')).toBeInTheDocument();
  });

  it('copes with a manual job without quote or posting date', () => {
    render(<JobFacts job={makeJob({ source: 'manual', hybridQuote: undefined, fit: 0, hybrid: 'unclear', language: 'unknown' })} />);
    expect(screen.getByText('Added manually')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown', { selector: 'dd' })).toHaveLength(2);
    expect(screen.queryByText(/Two days/)).not.toBeInTheDocument();
  });

  it('renders a safe external link, or says there is none', () => {
    const { rerender } = render(<JobLink url="https://jobs.example.com/1" />);
    const link = screen.getByRole('link', { name: /View posting/ });
    expect(link).toHaveAttribute('href', 'https://jobs.example.com/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    rerender(<JobLink url="javascript:alert(1)" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('No link to the posting')).toBeInTheDocument();
    rerender(<JobLink url={null} />);
    expect(screen.getByText('No link to the posting')).toBeInTheDocument();
  });

  it('Fact pairs a term with its value', () => {
    render(
      <dl>
        <Fact label="City">Utrecht</Fact>
      </dl>,
    );
    expect(screen.getByText('City')).toBeInTheDocument();
    expect(screen.getByText('Utrecht')).toBeInTheDocument();
  });
});
