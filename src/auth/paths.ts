export const LOGIN_PATH = '/login';
export const CHANGE_PASSWORD_PATH = '/change-password';
export const ACCOUNT_PATH = '/account';
export const HOME_PATH = '/new';

/** Router state attached to the redirect to /login (and /change-password): where the visitor was heading. */
export interface ReturnState {
  from: string;
}

const ENTRY_PATH = /^\/(?:login|change-password)(?:[/?#]|$)/;
const INTERNAL_PATH = /^\/(?![/\\])/;

/** Reads the return path from router state; anything that is not a plain in-app path falls back home. */
export function returnPathFrom(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) return HOME_PATH;
  const { from } = state;
  if (typeof from !== 'string' || !INTERNAL_PATH.test(from) || ENTRY_PATH.test(from)) return HOME_PATH;
  return from;
}
