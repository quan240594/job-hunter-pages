import { runCli, nodeIo } from './lib/cli.ts';
import { cleanupMain } from './lib/cleanup.ts';

await runCli(cleanupMain, nodeIo());
