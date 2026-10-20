import type { CliIo } from './cli.ts';
import { parseBool, requireEnv } from './env.ts';
import { createAdminClient } from './supabaseAdmin.ts';
import type { AdminClient, ExpiredDocument } from './supabaseAdmin.ts';

export const DEFAULT_BATCH_SIZE = 100;
export const DEFAULT_MAX_ROUNDS = 100;

export interface CleanupOptions {
  readonly dryRun: boolean;
  readonly log: (message: string) => void;
  readonly batchSize?: number;
  readonly maxRounds?: number;
}

export interface CleanupResult {
  readonly found: number;
  readonly storageRemoved: number;
  readonly rowsDeleted: number;
}

type CleanupClient = Pick<AdminClient, 'listExpiredDocuments' | 'removeStorageObjects' | 'deleteDocumentRows'>;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

async function removeBatch(client: CleanupClient, batch: readonly ExpiredDocument[]) {
  // Rows are deleted only after the storage call succeeded (a throw above skips this); objects that are already
  // gone are not an error for the Storage API, so a retry after a partial failure converges.
  const storageRemoved = await client.removeStorageObjects(batch.map((document) => document.storagePath));
  const rowsDeleted = await client.deleteDocumentRows(batch.map((document) => document.id));
  return { storageRemoved, rowsDeleted };
}

/**
 * Removes expired documents (storage object first, then the row). `applications` rows are never touched: they keep
 * `cv_label`, and their document foreign keys become null through `on delete set null`. Logs counts only.
 */
export async function cleanupExpired(client: CleanupClient, options: CleanupOptions): Promise<CleanupResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  let found = 0;
  let storageRemoved = 0;
  let rowsDeleted = 0;

  for (let round = 0; round < maxRounds; round += 1) {
    const expired = await client.listExpiredDocuments();
    if (expired.length === 0) break;
    found += expired.length;
    if (options.dryRun) break;

    let deletedThisRound = 0;
    for (const batch of chunk(expired, batchSize)) {
      const result = await removeBatch(client, batch);
      storageRemoved += result.storageRemoved;
      rowsDeleted += result.rowsDeleted;
      deletedThisRound += result.rowsDeleted;
    }
    // Nothing deleted although rows were listed: stop instead of looping on the same rows.
    if (deletedThisRound === 0) break;
  }

  options.log(`Expired documents found: ${found}`);
  options.log(
    options.dryRun
      ? 'DRY_RUN is on: nothing was removed.'
      : `Storage objects removed: ${storageRemoved}; document rows deleted: ${rowsDeleted}`,
  );
  return { found, storageRemoved, rowsDeleted };
}

export async function cleanupMain(io: CliIo): Promise<void> {
  const env = requireEnv(io.env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const client = createAdminClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    fetchFn: io.fetchFn,
  });
  await cleanupExpired(client, { dryRun: parseBool(io.env.DRY_RUN), log: io.log });
}
