// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nodeIo, runCli } from './cli.ts';
import { fakeIo } from './__fixtures__/fakes.ts';
import { requireEnvMain } from './requireEnvCli.ts';

describe('runCli', () => {
  it('runs the main function without touching the exit code on success', async () => {
    const { io, exitCodes, errors } = fakeIo();
    await runCli(async () => {
      await Promise.resolve();
    }, io);
    expect(exitCodes).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('reports a plain error and sets exit code 1', async () => {
    const { io, exitCodes, errors } = fakeIo();
    await runCli(() => Promise.reject(new Error('boom')), io);
    expect(errors).toEqual(['Error: boom']);
    expect(exitCodes).toEqual([1]);
  });

  it('emits a GitHub annotation inside Actions and copes with non-Error rejections', async () => {
    const { io, errors } = fakeIo({ env: { GITHUB_ACTIONS: 'true' } });
    await runCli(() => Promise.reject('not an error'), io);
    expect(errors).toEqual(['::error::Unknown error']);
  });
});

describe('nodeIo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('wires the process globals', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const io = nodeIo();
    expect(io.env).toBe(process.env);
    expect(io.args).toEqual(process.argv.slice(2));
    expect(io.fetchFn).toBe(fetch);
    io.log('hello');
    io.error('oops');
    io.setExitCode(3);
    expect(logSpy).toHaveBeenCalledWith('hello');
    expect(errorSpy).toHaveBeenCalledWith('oops');
    expect(process.exitCode).toBe(3);
  });
});

describe('requireEnvMain', () => {
  it('passes when every named variable is set', () => {
    const { io } = fakeIo({ env: { A: '1', B: '2' }, args: ['A', 'B'] });
    expect(() => requireEnvMain(io)).not.toThrow();
  });

  it('fails when a named variable is missing', () => {
    const { io } = fakeIo({ env: { A: '1' }, args: ['A', 'B'] });
    expect(() => requireEnvMain(io)).toThrow(/B/);
  });

  it('fails without arguments', () => {
    const { io } = fakeIo();
    expect(() => requireEnvMain(io)).toThrow(/Usage/);
  });
});
