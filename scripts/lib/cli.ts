import type { Env } from './env.ts';

export interface CliIo {
  readonly env: Env;
  readonly args: readonly string[];
  readonly fetchFn: typeof fetch;
  log(message: string): void;
  error(message: string): void;
  setExitCode(code: number): void;
}

export type CliMain = (io: CliIo) => void | Promise<void>;

export function nodeIo(): CliIo {
  return {
    env: process.env,
    args: process.argv.slice(2),
    fetchFn: fetch,
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    setExitCode: (code) => {
      process.exitCode = code;
    },
  };
}

/** Runs a script body; any failure becomes one short message (never a stack) and a non-zero exit code. */
export async function runCli(main: CliMain, io: CliIo): Promise<void> {
  try {
    await main(io);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    io.error(io.env.GITHUB_ACTIONS === 'true' ? `::error::${message}` : `Error: ${message}`);
    io.setExitCode(1);
  }
}
