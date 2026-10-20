// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { cleanupExpired, cleanupMain } from './cleanup.ts';
import { FAKE_SERVICE_KEY, FAKE_URL, fakeIo, jsonResponse } from './__fixtures__/fakes.ts';
import type { ExpiredDocument } from './supabaseAdmin.ts';

function docs(count: number, offset = 0): ExpiredDocument[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(offset + index).padStart(12, '0')}`,
    storagePath: `owner/doc-${offset + index}/file.pdf`,
  }));
}

function fakeClient(rounds: ExpiredDocument[][]) {
  const order: string[] = [];
  const pending = [...rounds];
  return {
    order,
    client: {
      listExpiredDocuments: vi.fn(() => {
        order.push('list');
        return Promise.resolve(pending.shift() ?? []);
      }),
      removeStorageObjects: vi.fn((paths: readonly string[]) => {
        order.push(`storage:${paths.length}`);
        return Promise.resolve(paths.length);
      }),
      deleteDocumentRows: vi.fn((ids: readonly string[]) => {
        order.push(`rows:${ids.length}`);
        return Promise.resolve(ids.length);
      }),
    },
  };
}

describe('cleanupExpired', () => {
  it('does nothing when nothing expired', async () => {
    const { client } = fakeClient([[]]);
    const log = vi.fn();
    await expect(cleanupExpired(client, { dryRun: false, log })).resolves.toEqual({
      found: 0,
      storageRemoved: 0,
      rowsDeleted: 0,
    });
    expect(client.removeStorageObjects).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('Expired documents found: 0');
  });

  it('removes storage objects before rows, in batches', async () => {
    const { client, order } = fakeClient([docs(5)]);
    const log = vi.fn();
    const result = await cleanupExpired(client, { dryRun: false, log, batchSize: 2 });
    expect(result).toEqual({ found: 5, storageRemoved: 5, rowsDeleted: 5 });
    expect(order).toEqual(['list', 'storage:2', 'rows:2', 'storage:2', 'rows:2', 'storage:1', 'rows:1', 'list']);
    expect(log).toHaveBeenCalledWith('Storage objects removed: 5; document rows deleted: 5');
  });

  it('keeps polling until no expired document is left', async () => {
    const { client } = fakeClient([docs(2), docs(1, 10)]);
    const result = await cleanupExpired(client, { dryRun: false, log: vi.fn() });
    expect(result.found).toBe(3);
    expect(client.listExpiredDocuments).toHaveBeenCalledTimes(3);
  });

  it('never deletes rows when the storage removal fails', async () => {
    const { client } = fakeClient([docs(2)]);
    client.removeStorageObjects.mockRejectedValueOnce(new Error('storage down'));
    await expect(cleanupExpired(client, { dryRun: false, log: vi.fn() })).rejects.toThrow('storage down');
    expect(client.deleteDocumentRows).not.toHaveBeenCalled();
  });

  it('is a no-op with dry run', async () => {
    const { client } = fakeClient([docs(4)]);
    const log = vi.fn();
    const result = await cleanupExpired(client, { dryRun: true, log });
    expect(result).toEqual({ found: 4, storageRemoved: 0, rowsDeleted: 0 });
    expect(client.removeStorageObjects).not.toHaveBeenCalled();
    expect(client.deleteDocumentRows).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('DRY_RUN is on: nothing was removed.');
  });

  it('stops instead of looping when no row could be deleted', async () => {
    const { client } = fakeClient([docs(2), docs(2), docs(2)]);
    client.deleteDocumentRows.mockResolvedValue(0);
    const result = await cleanupExpired(client, { dryRun: false, log: vi.fn() });
    expect(result.found).toBe(2);
    expect(client.listExpiredDocuments).toHaveBeenCalledTimes(1);
  });

  it('is bounded by maxRounds', async () => {
    const { client } = fakeClient([docs(1), docs(1, 1), docs(1, 2)]);
    const result = await cleanupExpired(client, { dryRun: false, log: vi.fn(), maxRounds: 2 });
    expect(result.found).toBe(2);
  });

  it('never logs document paths or ids', async () => {
    const { client } = fakeClient([docs(1)]);
    const log = vi.fn();
    await cleanupExpired(client, { dryRun: false, log });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/owner|doc-|0000/);
  });
});

describe('cleanupMain', () => {
  it('requires the service configuration', async () => {
    const { io } = fakeIo({ env: { SUPABASE_URL: FAKE_URL } });
    await expect(cleanupMain(io)).rejects.toThrow('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('runs against the injected fetch and honours DRY_RUN', async () => {
    const seen: string[] = [];
    const { io, logs } = fakeIo({
      env: { SUPABASE_URL: FAKE_URL, SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY, DRY_RUN: 'true' },
      fetchFn: (input) => {
        seen.push(String(input));
        return Promise.resolve(
          jsonResponse(200, [{ id: docs(1)[0]?.id, user_id: 'x', storage_path: 'a/b/c.pdf' }]),
        );
      },
    });
    await cleanupMain(io);
    expect(seen).toEqual([`${FAKE_URL}/rest/v1/rpc/expired_documents`]);
    expect(logs).toEqual(['Expired documents found: 1', 'DRY_RUN is on: nothing was removed.']);
  });
});
