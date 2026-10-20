import { MIN_PASSWORD_LENGTH, checkPassword, generatePassword } from './password';

describe('checkPassword', () => {
  it('rejects anything shorter than the minimum', () => {
    const report = checkPassword('Abc1!');
    expect(report.acceptable).toBe(false);
    expect(report.strength).toBe('Too short');
    expect(report.hints.find((hint) => hint.id === 'length')).toMatchObject({ met: false, required: true });
  });

  it('accepts the minimum length but rates a plain password as weak', () => {
    const report = checkPassword('a'.repeat(MIN_PASSWORD_LENGTH));
    expect(report.acceptable).toBe(true);
    expect(report.strength).toBe('Weak');
  });

  it('rates by the number of extra hints met', () => {
    expect(checkPassword('abcdefghijkL').strength).toBe('Weak');
    expect(checkPassword('abcdefghijL1').strength).toBe('Fair');
    expect(checkPassword('abcdefghij L1').strength).toBe('Good');
    expect(checkPassword('abcdefghij L1 and more').strength).toBe('Strong');
  });

  it('reports each hint', () => {
    const met = checkPassword('Correct Horse 9 Battery Staple').hints.filter((hint) => hint.met);
    expect(met.map((hint) => hint.id)).toEqual(['length', 'case', 'digit', 'symbol', 'long']);
  });
});

describe('generatePassword', () => {
  it('returns a long URL-safe random password that satisfies the minimum', () => {
    const first = generatePassword();
    expect(first).toMatch(/^[A-Za-z0-9_-]{20}$/);
    expect(checkPassword(first).acceptable).toBe(true);
    expect(generatePassword()).not.toBe(first);
  });
});
