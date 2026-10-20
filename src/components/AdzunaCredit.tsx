import { ADZUNA_LOGO_SRC, ADZUNA_URL } from '../lib/attribution';

interface AdzunaCreditProps {
  /** Official logo (>= 116x23 px). Without one, a text credit is shown. */
  logoSrc?: string | null;
}

/** Attribution that Adzuna's API terms require wherever its listings are shown. */
export function AdzunaCredit({ logoSrc = ADZUNA_LOGO_SRC }: Readonly<AdzunaCreditProps>) {
  return (
    <a className="credit" href={ADZUNA_URL} target="_blank" rel="noopener noreferrer">
      {logoSrc === null ? 'Jobs by Adzuna' : <img src={logoSrc} alt="Jobs by Adzuna" width={116} height={23} />}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

export function AdzunaFooterNote() {
  return (
    <p className="muted">
      Some job listings are provided by{' '}
      <a href={ADZUNA_URL} target="_blank" rel="noopener noreferrer">
        Adzuna (adzuna.nl)
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
      .
    </p>
  );
}
