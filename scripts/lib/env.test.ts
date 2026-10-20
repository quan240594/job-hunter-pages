// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseBool, requireEnv } from './env.ts';

describe('env', () => {
  it('returns trimmed values when all are set', () => {
    expect(requireEnv({ A: ' one ', B: 'two' }, ['A', 'B'])).toEqual({ A: 'one', B: 'two' });
  });

  it('throws naming every missing or blank variable, never a value', () => {
    const env = { A: 'visible-value', B: '', C: '  ' };
    expect(() => requireEnv(env, ['A', 'B', 'C', 'D'])).toThrow(/Missing required configuration: B, C, D\./);
    expect(() => requireEnv(env, ['A', 'B'])).not.toThrow(/visible-value/);
  });

  it('parses booleans leniently', () => {
    expect(parseBool('true')).toBe(true);
    expect(parseBool(' YES ')).toBe(true);
    expect(parseBool('1')).toBe(true);
    expect(parseBool('false')).toBe(false);
    expect(parseBool('')).toBe(false);
    expect(parseBool(undefined)).toBe(false);
  });
});
