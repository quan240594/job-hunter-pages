import { runCli, nodeIo } from './lib/cli.ts';
import { requireEnvMain } from './lib/requireEnvCli.ts';

await runCli(requireEnvMain, nodeIo());
