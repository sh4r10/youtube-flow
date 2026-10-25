import Dexie, { type EntityTable } from 'dexie';
import type { Item, Pipeline, PipelineEvent, Rule } from './types';

export const INBOX_ID = 'inbox';

export const db = new Dexie('youtube-flow') as Dexie & {
  pipelines: EntityTable<Pipeline, 'id'>;
  items: EntityTable<Item, 'id'>;
  rules: EntityTable<Rule, 'id'>;
  events: EntityTable<PipelineEvent, 'id'>;
};

db.version(1).stores({
  pipelines: 'id, order',
  items: 'id, videoId, pipelineId, status, order, [pipelineId+status]',
  rules: 'id, order, targetPipelineId',
  events: '++id, itemId, at',
});

export async function ensureInbox() {
  if (!(await db.pipelines.get(INBOX_ID))) {
    await db.pipelines.add({ id: INBOX_ID, name: 'Inbox', order: 0, isInbox: true });
  }
}

export const newId = () => crypto.randomUUID();
