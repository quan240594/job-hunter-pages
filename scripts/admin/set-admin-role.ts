import { runCli, nodeIo } from '../lib/cli.ts';
import { setAdminRoleMain } from '../lib/userAdmin.ts';

await runCli(setAdminRoleMain, nodeIo());
