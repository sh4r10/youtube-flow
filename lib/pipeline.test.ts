import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, ensureInbox, INBOX_ID } from './db';
import { capture, decide, queuedIn, restore } from './pipeline';
import { parseDuration, parseVideoId } from './youtube';

vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ title: 'T', author_name: 'Chan', thumbnail_url: 'x' }) })));

describe('parseVideoId', () => {
  it('accepts regular videos only', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1s')).toBe('dQw4w9WgXcQ');
    expect(parseVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBeNull();
    expect(parseVideoId('https://www.youtube.com/playlist?list=PL1')).toBeNull();
    expect(parseVideoId('/watch?v=abc')).toBeNull();
  });
  it('parses durations', () => {
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration(' 12:34 ')).toBe(754);
    expect(parseDuration('')).toBeUndefined();
  });
});

describe('capture', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureInbox();
  });

  it('lands in Inbox, dedupes, and follows rules', async () => {
    const a = await capture({ url: 'https://youtu.be/dQw4w9WgXcQ', method: 'intercept' });
    expect(a.kind).toBe('added');
    if (a.kind !== 'added') return;
    expect(a.pipeline.id).toBe(INBOX_ID);
    expect(a.item.title).toBe('T');

    const dup = await capture({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', method: 'menu' });
    expect(dup.kind).toBe('duplicate');

    await db.pipelines.add({ id: 'prog', name: 'Programming', order: 1, isInbox: false });
    await db.rules.add({ id: 'r1', order: 0, enabled: true, condition: { type: 'channel', value: 'chan' }, targetPipelineId: 'prog' });
    const b = await capture({ url: 'https://youtu.be/aaaaaaaaaaa', method: 'intercept' });
    expect(b.kind === 'added' && b.pipeline.id === 'prog' && b.viaRule).toBe(true);
  });

  it('keep moves to the back, drop archives, restore undoes', async () => {
    const r1 = await capture({ url: 'https://youtu.be/aaaaaaaaaaa', method: 'sweep', meta: { title: 'one' } });
    await new Promise((r) => setTimeout(r, 2));
    await capture({ url: 'https://youtu.be/bbbbbbbbbbb', method: 'sweep', meta: { title: 'two' } });
    const first = (r1 as { item: import('./types').Item }).item;

    await decide(first, { kind: 'keep' });
    expect((await queuedIn(INBOX_ID)).map((i) => i.title)).toEqual(['two', 'one']);

    const prev = await decide(first, { kind: 'drop' });
    expect((await queuedIn(INBOX_ID)).length).toBe(1);
    await restore(prev);
    expect((await queuedIn(INBOX_ID)).length).toBe(2);
  });
});

describe('pipeline management', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureInbox();
  });

  it('delete sends queued items to Inbox and drops its rules; reorder swaps neighbours', async () => {
    const { createPipeline, deletePipeline, movePipeline, restoreToPipeline } = await import('./pipeline');
    const a = await createPipeline('A');
    const b = await createPipeline('B');
    await db.rules.add({ id: 'r', order: 0, enabled: true, condition: { type: 'keyword', value: 'x' }, targetPipelineId: a });
    const r = await capture({ url: 'https://youtu.be/ccccccccccc', method: 'menu', pipelineId: a, meta: { title: 'in A' } });
    expect(r.kind).toBe('added');

    await movePipeline(b, -1);
    expect((await db.pipelines.orderBy('order').toArray()).map((p) => p.name)).toEqual(['Inbox', 'B', 'A']);

    await deletePipeline(a);
    expect(await db.pipelines.get(a)).toBeUndefined();
    expect(await db.rules.count()).toBe(0);
    expect((await queuedIn(INBOX_ID)).map((i) => i.title)).toEqual(['in A']);

    const item = (await queuedIn(INBOX_ID))[0];
    const prev = await decide(item, { kind: 'drop' });
    await restoreToPipeline({ ...prev, status: 'dropped' }, b);
    expect((await queuedIn(b)).map((i) => i.title)).toEqual(['in A']);
  });
});
