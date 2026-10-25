import { db, INBOX_ID, newId } from './db';
import type { CaptureResult, ItemMeta } from './messages';
import type { CaptureMethod, Item, Pipeline, Rule } from './types';
import { fetchOEmbed, parseVideoId, thumbUrl, watchUrl } from './youtube';

export function matchRule(rule: Rule, item: Pick<Item, 'title' | 'channel' | 'durationSec'>): boolean {
  if (!rule.enabled) return false;
  const c = rule.condition;
  switch (c.type) {
    case 'channel':
      return item.channel.toLowerCase() === c.value.toLowerCase();
    case 'keyword':
      return item.title.toLowerCase().includes(c.value.toLowerCase());
    case 'duration': {
      const d = item.durationSec;
      if (d == null) return false;
      return (c.minSec == null || d >= c.minSec) && (c.maxSec == null || d <= c.maxSec);
    }
  }
}

export async function capture(input: {
  url: string;
  method: CaptureMethod;
  pipelineId?: string;
  meta?: ItemMeta;
}): Promise<CaptureResult> {
  const videoId = parseVideoId(input.url);
  if (!videoId) return { kind: 'ignored', reason: 'Not a YouTube video link' };
  const pipelines = await db.pipelines.orderBy('order').toArray();

  const existing = await db.items
    .where('videoId')
    .equals(videoId)
    .and((i) => i.status === 'queued' || i.status === 'watching')
    .first();
  if (existing) {
    const pipeline = pipelines.find((p) => p.id === existing.pipelineId) ?? pipelines[0];
    return { kind: 'duplicate', item: existing, pipeline, pipelines };
  }

  let meta = input.meta ?? {};
  if (!meta.title) {
    try {
      meta = { ...(await fetchOEmbed(videoId)), ...meta };
    } catch {
      // offline or oEmbed blocked: keep going with a bare item
    }
  }
  const draft = { title: meta.title ?? watchUrl(videoId), channel: meta.channel ?? '', durationSec: meta.durationSec };

  let pipelineId = input.pipelineId;
  let viaRule = false;
  if (!pipelineId) {
    const rules = await db.rules.orderBy('order').toArray();
    const hit = rules.find((r) => matchRule(r, draft));
    if (hit && pipelines.some((p) => p.id === hit.targetPipelineId)) {
      pipelineId = hit.targetPipelineId;
      viaRule = true;
    }
  }
  pipelineId ??= INBOX_ID;
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  if (!pipeline) return { kind: 'ignored', reason: 'Pipeline no longer exists' };

  const now = Date.now();
  const item: Item = {
    id: newId(),
    url: watchUrl(videoId),
    kind: 'youtube-video',
    videoId,
    ...draft,
    thumbnailUrl: meta.thumbnailUrl ?? thumbUrl(videoId),
    pipelineId,
    status: 'queued',
    order: now,
    addedAt: now,
    captureMethod: input.method,
  };
  await db.transaction('rw', db.items, db.events, async () => {
    await db.items.add(item);
    await db.events.add({ itemId: item.id, action: 'added', at: now, toPipelineId: pipelineId });
  });
  return { kind: 'added', item, pipeline, viaRule, pipelines };
}

export type Decision = { kind: 'watch' } | { kind: 'keep' } | { kind: 'drop' } | { kind: 'move'; pipelineId: string };

/** Applies a decision and returns the item as it was, for undo. */
export async function decide(item: Item, d: Decision): Promise<Item> {
  const now = Date.now();
  const patch: Partial<Item> =
    d.kind === 'watch'
      ? { status: 'watching', decidedAt: now }
      : d.kind === 'drop'
        ? { status: 'dropped', decidedAt: now }
        : d.kind === 'keep'
          ? { order: now }
          : { pipelineId: d.pipelineId, order: now };
  const action = d.kind === 'watch' ? 'watching' : d.kind === 'keep' ? 'kept' : d.kind === 'drop' ? 'dropped' : 'moved';
  await db.transaction('rw', db.items, db.events, async () => {
    await db.items.update(item.id, patch);
    await db.events.add({
      itemId: item.id,
      action,
      at: now,
      fromPipelineId: item.pipelineId,
      toPipelineId: d.kind === 'move' ? d.pipelineId : undefined,
    });
  });
  return item;
}

/** Puts an item back exactly as it was (undo). */
export async function restore(prev: Item) {
  await db.transaction('rw', db.items, db.events, async () => {
    await db.items.put(prev);
    await db.events.add({ itemId: prev.id, action: 'restored', at: Date.now(), toPipelineId: prev.pipelineId });
  });
}

/** Archive → back into a pipeline as a fresh queued item. */
export async function restoreToPipeline(item: Item, pipelineId = item.pipelineId) {
  const now = Date.now();
  await db.transaction('rw', db.items, db.events, async () => {
    await db.items.update(item.id, { status: 'queued', pipelineId, order: now, decidedAt: undefined });
    await db.events.add({ itemId: item.id, action: 'restored', at: now, fromPipelineId: item.pipelineId, toPipelineId: pipelineId });
  });
}

export async function markWatched(videoId: string) {
  await db.items
    .where('videoId')
    .equals(videoId)
    .and((i) => i.status === 'watching')
    .modify({ status: 'watched', decidedAt: Date.now() });
}

export const queuedIn = (pipelineId: string) => db.items.where('[pipelineId+status]').equals([pipelineId, 'queued']).sortBy('order');
export const queuedCount = (pipelineId?: string) =>
  pipelineId ? db.items.where('[pipelineId+status]').equals([pipelineId, 'queued']).count() : db.items.where('status').equals('queued').count();

export async function queuedCounts(pipelines: Pipeline[]): Promise<Record<string, number>> {
  return Object.fromEntries(await Promise.all(pipelines.map(async (p) => [p.id, await queuedCount(p.id)])));
}

// Pipeline management

export const PIPELINE_COLORS = ['#9AA8FF', '#E58FB8', '#6FD3C4', '#F2A65A', '#B8E58F', '#C9A3FF'];

export async function createPipeline(name: string): Promise<string> {
  const n = await db.pipelines.count();
  const id = newId();
  await db.pipelines.add({ id, name, order: Date.now(), isInbox: false, color: PIPELINE_COLORS[n % PIPELINE_COLORS.length] });
  return id;
}

/** Deletes a pipeline; its queued items go to the Inbox, archived ones keep the old id for history. */
export async function deletePipeline(id: string) {
  if (id === INBOX_ID) return;
  await db.transaction('rw', db.pipelines, db.items, db.rules, async () => {
    await db.items.where('[pipelineId+status]').equals([id, 'queued']).modify({ pipelineId: INBOX_ID });
    await db.rules.where('targetPipelineId').equals(id).delete();
    await db.pipelines.delete(id);
  });
}

/** Swaps order with the neighbour above (-1) or below (+1). Inbox stays first. */
export async function movePipeline(id: string, dir: -1 | 1) {
  const all = (await db.pipelines.orderBy('order').toArray()).filter((p) => !p.isInbox);
  const i = all.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  await db.transaction('rw', db.pipelines, async () => {
    await db.pipelines.update(all[i].id, { order: all[j].order });
    await db.pipelines.update(all[j].id, { order: all[i].order });
  });
}
