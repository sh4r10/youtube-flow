import { db, INBOX_ID, newId } from './db';
import { loadSettings, settings } from './settings';
import type { ExportFile, Item } from './types';

export async function exportData(o: { includeKeys: boolean }): Promise<ExportFile> {
  const s = await loadSettings();
  return {
    schemaVersion: 1,
    exportedAt: Date.now(),
    pipelines: await db.pipelines.orderBy('order').toArray(),
    items: await db.items.toArray(),
    rules: await db.rules.orderBy('order').toArray(),
    events: await db.events.toArray(),
    settings: o.includeKeys ? s : { ...s, ai: { ...s.ai, apiKey: '' } },
  };
}

export async function importData(file: ExportFile, mode: 'merge' | 'replace'): Promise<{ pipelines: number; items: number; rules: number }> {
  if (!file || file.schemaVersion !== 1 || !Array.isArray(file.pipelines) || !Array.isArray(file.items)) {
    throw new Error('Not a YouTube Flow backup (expected schemaVersion 1)');
  }
  const counts = { pipelines: 0, items: 0, rules: 0 };
  await db.transaction('rw', db.pipelines, db.items, db.rules, db.events, async () => {
    if (mode === 'replace') {
      await Promise.all([db.pipelines.clear(), db.items.clear(), db.rules.clear(), db.events.clear()]);
    }
    // Imported pipeline id -> local id. In merge mode pipelines match by name.
    const idMap = new Map<string, string>();
    const existing = await db.pipelines.toArray();
    for (const p of file.pipelines) {
      const local = p.isInbox ? existing.find((e) => e.isInbox) : existing.find((e) => e.name.toLowerCase() === p.name.toLowerCase());
      if (local) {
        idMap.set(p.id, local.id);
        continue;
      }
      const id = p.isInbox ? INBOX_ID : existing.some((e) => e.id === p.id) ? newId() : p.id;
      await db.pipelines.add({ ...p, id });
      existing.push({ ...p, id });
      idMap.set(p.id, id);
      counts.pipelines++;
    }
    const inboxId = existing.find((e) => e.isInbox)?.id ?? INBOX_ID;
    const target = (id: string) => idMap.get(id) ?? (existing.some((e) => e.id === id) ? id : inboxId);

    const known = new Set((await db.items.toArray()).map((i) => i.videoId));
    const itemIdMap = new Map<string, string>();
    for (const it of file.items) {
      if (known.has(it.videoId)) continue;
      known.add(it.videoId);
      const item: Item = { ...it, id: (await db.items.get(it.id)) ? newId() : it.id, pipelineId: target(it.pipelineId) };
      itemIdMap.set(it.id, item.id);
      await db.items.add(item);
      counts.items++;
    }
    const lastRule = await db.rules.orderBy('order').last();
    let order = (lastRule?.order ?? -1) + 1;
    for (const r of file.rules ?? []) {
      await db.rules.add({ ...r, id: (await db.rules.get(r.id)) ? newId() : r.id, order: order++, targetPipelineId: target(r.targetPipelineId) });
      counts.rules++;
    }
    for (const e of file.events ?? []) {
      const itemId = itemIdMap.get(e.itemId);
      if (!itemId) continue; // only events of items we imported
      await db.events.add({ ...e, id: undefined, itemId, fromPipelineId: e.fromPipelineId && target(e.fromPipelineId), toPipelineId: e.toPipelineId && target(e.toPipelineId) });
    }
  });
  if (file.settings) {
    const cur = await loadSettings();
    const apiKey = file.settings.ai?.apiKey || cur.ai.apiKey; // never wipe a key with an export that stripped it
    await settings.setValue({ ...cur, ...file.settings, ai: { ...cur.ai, ...file.settings.ai, apiKey } });
  }
  return counts;
}
