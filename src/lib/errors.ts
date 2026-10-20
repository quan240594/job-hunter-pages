export const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

/** The message of an ApiError (or any thrown Error); a generic text for anything else. */
export function errorMessage(reason: unknown): string {
  if (typeof reason === 'object' && reason !== null && 'message' in reason) {
    const { message } = reason;
    if (typeof message === 'string' && message !== '') return message;
  }
  return FALLBACK_MESSAGE;
}

/** Only http(s) links are rendered as hyperlinks; anything else (javascript:, data:) is dropped. Relative URLs resolve against the page. */
export function safeHttpUrl(url: string | null): string | null {
  if (url === null || url === '') return null;
  try {
    const parsed = new URL(url, document.baseURI);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** True for an absolute http(s) URL (profile links must not be relative). */
export function isAbsoluteHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
