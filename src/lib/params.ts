/** Returns a copy of `params` with `patch` applied (null or empty removes a key). The page resets unless patched. */
export function withParams(params: URLSearchParams, patch: Record<string, string | null>): URLSearchParams {
  const next = new URLSearchParams(params);
  if (!('page' in patch)) next.delete('page');
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  }
  return next;
}

export function readPage(params: URLSearchParams): number {
  const page = Number.parseInt(params.get('page') ?? '1', 10);
  return Number.isNaN(page) || page < 1 ? 1 : page;
}
