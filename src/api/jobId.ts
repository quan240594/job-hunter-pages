// The frozen job-id scheme of the private tracker: first 16 hex chars of sha1(norm(company)|norm(title)|norm(city)).
// Both DataApi implementations use it so a manual job and a later scraper ingest of the same job collide.

const COMBINING_MARKS = /\p{M}/gu;
const ID_LENGTH = 16;

const LEGAL_FORM_WORDS: ReadonlySet<string> = new Set(['bv', 'nv', 'inc', 'ltd', 'llc', 'gmbh', 'group', 'holding', 'holdings', 'the']);

// Letter-pair legal forms ("B.V.", "N.V.") normalise to two single-letter tokens.
const SPLIT_LEGAL_FORMS: ReadonlySet<string> = new Set(['b v', 'n v']);

// Phrase (as it appears in normalised text) -> normalised city.
const CITY_PHRASES: readonly (readonly [string, string])[] = [
  ['amsterdam', 'amsterdam'],
  ['rotterdam', 'rotterdam'],
  ['den haag', 'den haag'],
  ['the hague', 'den haag'],
  ['s gravenhage', 'den haag'],
  ['gravenhage', 'den haag'],
];

function isAsciiAlphanumeric(char: string): boolean {
  return (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9');
}

export function normaliseText(value: string): string {
  const folded = value.toLowerCase().normalize('NFKD').replaceAll(COMBINING_MARKS, '');
  let result = '';
  let pendingSpace = false;
  for (const char of folded) {
    if (isAsciiAlphanumeric(char)) {
      result += pendingSpace && result !== '' ? ` ${char}` : char;
      pendingSpace = false;
    } else {
      pendingSpace = true;
    }
  }
  return result;
}

// Earliest whole-word occurrence of a known city name or alias wins.
function findCityInText(text: string): string | null {
  const padded = ` ${text} `;
  let best: { index: number; city: string } | null = null;
  for (const [phrase, city] of CITY_PHRASES) {
    const index = padded.indexOf(` ${phrase} `);
    if (index !== -1 && (best === null || index < best.index)) best = { index, city };
  }
  return best === null ? null : best.city;
}

export function normaliseCity(value: string): string {
  const text = normaliseText(value);
  return findCityInText(text) ?? text;
}

function dropTrailingLegalForm(tokens: readonly string[]): readonly string[] {
  if (tokens.length <= 1) return tokens;
  if (LEGAL_FORM_WORDS.has(tokens.slice(-1).join(''))) return tokens.slice(0, -1);
  const lastTwo = tokens.slice(-2).join(' ');
  return tokens.length > 2 && SPLIT_LEGAL_FORMS.has(lastTwo) ? tokens.slice(0, -2) : tokens;
}

// Always keeps at least one token so a company never normalises to an empty string.
export function normaliseCompany(value: string): string {
  let tokens: readonly string[] = normaliseText(value).split(' ');
  let previousLength = -1;
  while (tokens.length !== previousLength) {
    previousLength = tokens.length;
    tokens = dropTrailingLegalForm(tokens);
  }
  return tokens.join(' ');
}

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function roundFunction(round: number, b: number, c: number, d: number): readonly [number, number] {
  if (round < 20) return [(b & c) | (~b & d), 0x5a827999];
  if (round < 40) return [b ^ c ^ d, 0x6ed9eba1];
  if (round < 60) return [(b & c) | (b & d) | (c & d), 0x8f1bbcdc];
  return [b ^ c ^ d, 0xca62c1d6];
}

function padMessage(message: string): DataView {
  const bytes = new TextEncoder().encode(message);
  const paddedLength = ((bytes.length + 8) >> 6) * 64 + 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 2 ** 32));
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  return view;
}

/**
 * SHA-1 as lowercase hex. The id scheme is frozen (the private scraper computes the same value), and the digest only
 * names a job: it is never used for integrity or security. Implemented here because the Web Crypto API is async.
 */
export function sha1Hex(message: string): string {
  const view = padMessage(message);
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const words = new Uint32Array(80);
  for (let offset = 0; offset < view.byteLength; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i++) words[i] = rotateLeft(words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16], 1);
    let [a, b, c, d, e] = state;
    for (let round = 0; round < 80; round++) {
      const [mix, constant] = roundFunction(round, b, c, d);
      const next = (rotateLeft(a, 5) + mix + e + constant + words[round]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = next;
    }
    [a, b, c, d, e].forEach((value, index) => {
      state[index] = (state[index] + value) >>> 0;
    });
  }
  return state.map((word) => word.toString(16).padStart(8, '0')).join('');
}

export function jobId(company: string, title: string, city: string): string {
  return sha1Hex(`${normaliseCompany(company)}|${normaliseText(title)}|${normaliseCity(city)}`).slice(0, ID_LENGTH);
}
