import { runCli, nodeIo } from '../lib/cli.ts';
import { inviteUserMain } from '../lib/userAdmin.ts';

await runCli(inviteUserMain, nodeIo());
