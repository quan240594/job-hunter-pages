import { render, screen } from '@testing-library/react';
import { ADZUNA_LOGO_SRC, ADZUNA_URL, sourceLabel } from '../lib/attribution';
import { AdzunaCredit, AdzunaFooterNote } from './AdzunaCredit';

describe('AdzunaCredit', () => {
  it('links "Jobs by Adzuna" to adzuna.nl in a new tab, as text while there is no logo', () => {
    render(<AdzunaCredit />);
    const link = screen.getByRole('link', { name: /Jobs by Adzuna/ });
    expect(link).toHaveAttribute('href', 'https://www.adzuna.nl/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(ADZUNA_LOGO_SRC).toBeNull();
    expect(ADZUNA_URL).toBe('https://www.adzuna.nl/');
  });

  it('shows the logo (at least 116x23) inside the link when a source is given', () => {
    render(<AdzunaCredit logoSrc="/job-hunter-pages/adzuna-logo.png" />);
    const logo = screen.getByRole('img', { name: 'Jobs by Adzuna' });
    expect(logo).toHaveAttribute('src', '/job-hunter-pages/adzuna-logo.png');
    expect(logo).toHaveAttribute('width', '116');
    expect(logo).toHaveAttribute('height', '23');
    expect(screen.getByRole('link')).toContainElement(logo);
  });

  it('has a footer sentence with the link', () => {
    const { container } = render(<AdzunaFooterNote />);
    expect(container).toHaveTextContent('Some job listings are provided by Adzuna (adzuna.nl) (opens in a new tab).');
    expect(screen.getByRole('link', { name: /Adzuna \(adzuna\.nl\)/ })).toHaveAttribute('href', 'https://www.adzuna.nl/');
    expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('sourceLabel', () => {
  it('words known sources and passes others through', () => {
    expect(sourceLabel('manual')).toBe('Added manually');
    expect(sourceLabel('jooble')).toBe('via Jooble');
    expect(sourceLabel('greenhouse:example')).toBe('greenhouse:example');
  });
});
