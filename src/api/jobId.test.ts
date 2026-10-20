import { jobId, normaliseCity, normaliseCompany, normaliseText, sha1Hex } from './jobId';

describe('normaliseText', () => {
  it('lower-cases, folds accents and collapses punctuation', () => {
    expect(normaliseText('  Sénior   C++/Java-Engineer!! ')).toBe('senior c java engineer');
    expect(normaliseText('')).toBe('');
    expect(normaliseText('---')).toBe('');
    expect(normaliseText('Łódź')).toBe('odz');
  });
});

describe('normaliseCompany', () => {
  it('drops trailing legal-form words, also repeated', () => {
    expect(normaliseCompany('Acme Group Holding B.V.')).toBe('acme');
    expect(normaliseCompany('The Acme Inc')).toBe('the acme');
    expect(normaliseCompany('Acme N.V.')).toBe('acme');
  });

  it('never normalises to an empty company', () => {
    expect(normaliseCompany('Holding')).toBe('holding');
    expect(normaliseCompany('B.V.')).toBe('b v');
    expect(normaliseCompany('')).toBe('');
  });
});

describe('normaliseCity', () => {
  it('maps aliases to the canonical city and keeps unknown cities', () => {
    expect(normaliseCity('The Hague')).toBe('den haag');
    expect(normaliseCity("'s-Gravenhage")).toBe('den haag');
    expect(normaliseCity('Rotterdam, NL')).toBe('rotterdam');
    expect(normaliseCity('Amsterdam or Rotterdam')).toBe('amsterdam');
    expect(normaliseCity('Rotterdam or Amsterdam')).toBe('rotterdam');
    expect(normaliseCity('Utrecht')).toBe('utrecht');
  });
});

describe('sha1Hex', () => {
  it.each([
    ['', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '84983e441c3bd26ebaae4aa1f95129e5e54670f1'],
    ['Zażółć gęślą jaźń | Ünïcode', '0f3032188b45e3390e4f55b15ec6ac5ac2151742'],
    ['x'.repeat(1), '11f6ad8ec52a2984abaafd7c3b516503785c2072'],
    ['x'.repeat(55), 'cef734ba81a024479e09eb5a75b6ddae62e6abf1'],
    ['x'.repeat(56), '901305367c259952f4e7af8323f480d59f81335b'],
    ['x'.repeat(63), '0ddc4e0cccd9a12850deb5abb0853a4425559fec'],
    ['x'.repeat(64), 'bb2fa3ee7afb9f54c6dfb5d021f14b1ffe40c163'],
    ['x'.repeat(65), '78c741ddc482e4cdf8c474a0876347a0905b6233'],
    ['x'.repeat(119), '4300320394f7ee239bcdce7d3b8bcee173a0cd5c'],
    ['x'.repeat(120), 'ceb2821639c4b6dcb10bce0e522ca2e608ce056d'],
    ['x'.repeat(128), '150fa3fbdc899bd0b8f95a9fb6027f564d953762'],
  ])('matches the reference digest of %j', (input, digest) => {
    expect(sha1Hex(input)).toBe(digest);
  });
});

describe('jobId', () => {
  it('is the 16 hex char prefix of the digest of the normalised key', () => {
    expect(jobId('Acme B.V.', 'Senior Java Engineer', 'The Hague')).toBe('55383042c0d8062c');
  });

  it('is stable across casing and legal forms', () => {
    const a = jobId('ACME bv', 'Dev', 'Amsterdam');
    expect(a).toBe(jobId('acme', 'dev', 'amsterdam'));
    expect(a).toHaveLength(16);
  });
});
