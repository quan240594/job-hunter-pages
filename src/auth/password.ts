export const MIN_PASSWORD_LENGTH = 12;
const LONG_PASSWORD_LENGTH = 16;
const GENERATED_LENGTH = 20;
// 64 characters, so one random byte maps onto the alphabet without modulo bias.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export interface PasswordHint {
  id: string;
  text: string;
  met: boolean;
  /** Required hints block the form; the others only raise the strength. */
  required: boolean;
}

export type StrengthLabel = 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';

export interface PasswordReport {
  hints: PasswordHint[];
  strength: StrengthLabel;
  /** Meets the only hard rule (minimum length). */
  acceptable: boolean;
}

const STRENGTHS: readonly StrengthLabel[] = ['Weak', 'Weak', 'Fair', 'Good', 'Strong'];

export function checkPassword(password: string): PasswordReport {
  const long = password.length >= MIN_PASSWORD_LENGTH;
  const hints: PasswordHint[] = [
    { id: 'length', text: `At least ${MIN_PASSWORD_LENGTH} characters`, met: long, required: true },
    {
      id: 'case',
      text: 'Upper and lower case letters',
      met: /[a-z]/.test(password) && /[A-Z]/.test(password),
      required: false,
    },
    { id: 'digit', text: 'A number', met: /\d/.test(password), required: false },
    { id: 'symbol', text: 'A symbol or space', met: /[^\p{L}\p{N}]/u.test(password), required: false },
    {
      id: 'long',
      text: `${LONG_PASSWORD_LENGTH} characters or more`,
      met: password.length >= LONG_PASSWORD_LENGTH,
      required: false,
    },
  ];
  if (!long) return { hints, strength: 'Too short', acceptable: false };
  const points = hints.filter((hint) => !hint.required && hint.met).length;
  return { hints, strength: STRENGTHS[points], acceptable: true };
}

/** A random temporary password for an admin to hand over; the user must change it at first sign-in anyway. */
export function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(GENERATED_LENGTH));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}
