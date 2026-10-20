import { apiError } from './errors';
import type { Category, Fit, HybridStatus, ISODateTime, LanguageStatus, ManualJobInput } from './types';

export const MANUAL_SOURCE = 'manual';
const UNKNOWN_LOCATION = 'Unknown';

/** A manual job after validation, with the contract defaults applied (absent, not null, for unknown optionals). */
export interface PreparedManualJob {
  title: string;
  company: string;
  location: string;
  url: string | null;
  description: string;
  postedAt?: ISODateTime;
  fit: Fit;
  category: Category;
  hybrid: HybridStatus;
  hybridQuote?: string;
  language: LanguageStatus;
}

function requiredText(value: string, label: string): string {
  const text = value.trim();
  if (text === '') throw apiError('validation', `${label} is required.`);
  return text;
}

function optionalUrl(value: string | undefined): string | null {
  const text = value?.trim() ?? '';
  if (text === '') return null;
  const protocol = URL.canParse(text) ? new URL(text).protocol : '';
  if (protocol !== 'https:' && protocol !== 'http:') throw apiError('validation', 'The job URL must be an http(s) URL.');
  return text;
}

function optionalDate(value: string | undefined): string | undefined {
  const text = value?.trim() ?? '';
  if (text === '') return undefined;
  if (Number.isNaN(Date.parse(text))) throw apiError('validation', 'The posted date is not a valid date.');
  return text;
}

function validFit(value: number = 0): Fit {
  if (!Number.isInteger(value) || value < 0 || value > 5) throw apiError('validation', 'Fit must be a whole number from 0 to 5.');
  return value as Fit;
}

export function prepareManualJob(input: ManualJobInput): PreparedManualJob {
  const location = input.location.trim();
  const postedAt = optionalDate(input.postedAt);
  const hybridQuote = input.hybridQuote?.trim() ?? '';
  return {
    title: requiredText(input.title, 'Title'),
    company: requiredText(input.company, 'Company'),
    location: location === '' ? UNKNOWN_LOCATION : location,
    url: optionalUrl(input.url),
    description: input.description,
    ...(postedAt === undefined ? {} : { postedAt }),
    fit: validFit(input.fit),
    category: input.category ?? 'C',
    hybrid: input.hybrid ?? 'unclear',
    ...(hybridQuote === '' ? {} : { hybridQuote }),
    language: input.language ?? 'unknown',
  };
}
