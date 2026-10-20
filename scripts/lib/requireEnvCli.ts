import type { CliIo } from './cli.ts';
import { requireEnv } from './env.ts';

/** Fails the job with one clear message when any named variable is empty: `node scripts/require-env.ts NAME...`. */
export function requireEnvMain(io: CliIo): void {
  if (io.args.length === 0) {
    throw new Error('Usage: require-env.ts NAME [NAME...]');
  }
  requireEnv(io.env, io.args);
}
