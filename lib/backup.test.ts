import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportData, importData } from './backup';
import { db, ensureInbox, INBOX_ID } from './db';
import { capture } from './pipeline';
import type { ExportFile } from './types';

vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ title: 'T', author_name: 'Chan', thumbnail_url: 'x' }) })));
vi.mock('wxt/utils/storage', () => {
  let v: unknown;
  return { storage: { defineItem: (_k: string, o: { fallback: unknown }) => ({ getValue: async () => v ?? o.fallback, setValue: async (n: unknown) => void (v = n), watch: () => () => {} }) } };
});

describe('backup', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureInbox();
  });

  it('round-trips and merges without duplicates', async () => {
    await db.pipelines.add({ id: 'p1', name: 'Programming', order: 1, isInbox: false });
    await capture({ url: 'https://youtu.be/aaaaaaaaaaa', method: 'sweep', pipelineId: 'p1' });
    await db.rules.add({ id: 'r1', order: 0, enabled: true, condition: { type: 'keyword', value: 'go' }, targetPipelineId: 'p1' });
    const file = await exportData({ includeKeys: false });
    expect(file.schemaVersion).toBe(1);
    expect(file.settings?.ai.apiKey).toBe('');

    // Same backup into a fresh DB where "Programming" already exists under another id.
    await db.delete();
    await db.open();
    await ensureInbox();
    await db.pipelines.add({ id: 'other', name: 'programming', order: 1, isInbox: false });
    const r = await importData(file, 'merge');
    expect(r).toEqual({ pipelines: 0, items: 1, rules: 1 });
    expect((await db.items.toArray())[0].pipelineId).toBe('other');
    expect((await db.rules.toArray())[0].targetPipelineId).toBe('other');
    expect(await db.events.count()).toBe(1);

    const again = await importData(file, 'merge');
    expect(again.items).toBe(0);
    expect(await db.items.count()).toBe(1);
  });

  it('replace wipes first, unknown pipeline falls back to Inbox', async () => {
    await capture({ url: 'https://youtu.be/bbbbbbbbbbb', method: 'sweep' });
    const file: ExportFile = {
      schemaVersion: 1,
      exportedAt: 0,
      pipelines: [{ id: INBOX_ID, name: 'Inbox', order: 0, isInbox: true }],
      items: [{ id: 'x', url: 'u', kind: 'youtube-video', videoId: 'ccccccccccc', title: 't', channel: '', thumbnailUrl: '', pipelineId: 'gone', status: 'queued', order: 1, addedAt: 1, captureMethod: 'import' }],
      rules: [],
      events: [],
    };
    const r = await importData(file, 'replace');
    expect(r.items).toBe(1);
    expect(await db.items.count()).toBe(1);
    expect((await db.items.get('x'))?.pipelineId).toBe(INBOX_ID);
    await expect(importData({ schemaVersion: 2 } as unknown as ExportFile, 'merge')).rejects.toThrow(/schemaVersion 1/);
  });
});
