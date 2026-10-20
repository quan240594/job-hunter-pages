export const ADZUNA_URL = 'https://www.adzuna.nl/';

/**
 * Official Adzuna logo (at least 116x23 px) once the owner has it: put the file in public/ and set this to its URL,
 * e.g. `${import.meta.env.BASE_URL}adzuna-logo.png`. While null, the credit is shown as text.
 */
export const ADZUNA_LOGO_SRC: string | null = null;

export const ADZUNA_SOURCE = 'adzuna';

/** Plain-text label of a job source; Adzuna is rendered by <AdzunaCredit /> instead. */
export function sourceLabel(source: string): string {
  if (source === 'manual') return 'Added manually';
  if (source === 'jooble') return 'via Jooble';
  return source;
}
