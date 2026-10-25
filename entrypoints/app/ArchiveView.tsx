import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { PipelineDot } from '@/components/PipelineDot';
import { db } from '@/lib/db';
import { age } from '@/lib/format';
import { restoreToPipeline } from '@/lib/pipeline';
import type { Item, Pipeline } from '@/lib/types';
import { formatDuration } from '@/lib/youtube';

const DAY = 86_400_000;

export function ArchiveView({ pipelines }: { pipelines: Pipeline[] }) {
  const [pipelineId, setPipelineId] = useState('all');
  const [outcome, setOutcome] = useState<'all' | 'watched' | 'dropped'>('all');
  const [days, setDays] = useState(0);
  const [q, setQ] = useState('');

  const watching = useLiveQuery(() => db.items.where('status').equals('watching').reverse().sortBy('decidedAt'));
  const archived = useLiveQuery(() => db.items.where('status').anyOf('watched', 'dropped').reverse().sortBy('decidedAt'));

  const needle = q.trim().toLowerCase();
  const since = days ? Date.now() - days * DAY : 0;
  const rows = (archived ?? []).filter(
    (i) =>
      (pipelineId === 'all' || i.pipelineId === pipelineId) &&
      (outcome === 'all' || i.status === outcome) &&
      (i.decidedAt ?? 0) >= since &&
      (!needle || i.title.toLowerCase().includes(needle) || i.channel.toLowerCase().includes(needle)),
  );
  const name = (id: string) => pipelines.find((p) => p.id === id)?.name ?? 'deleted pipeline';

  async function restore(item: Item, to?: string) {
    await restoreToPipeline(item, to);
    toast(`Restored to ${name(to ?? item.pipelineId)}`, { description: item.title });
  }

  async function markWatched(item: Item) {
    const now = Date.now();
    await db.transaction('rw', db.items, db.events, async () => {
      await db.items.update(item.id, { status: 'watched', decidedAt: now });
      await db.events.add({ itemId: item.id, action: 'watched', at: now, fromPipelineId: item.pipelineId });
    });
  }

  return (
    <div className="flex max-w-[920px] flex-col gap-8">
      {!!watching?.length && (
        <section>
          <h2 className="mb-1 text-lg font-semibold tracking-[-0.01em]">Watching</h2>
          <p className="mb-3 text-muted">Opened but not yet marked watched. They mark themselves at the playback threshold.</p>
          <ul className="flex flex-col gap-0.5">
            {watching.map((i) => (
              <Row key={i.id} item={i} meta={[i.channel, i.durationSec && formatDuration(i.durationSec), `opened ${age(i.decidedAt ?? i.addedAt)} ago`]}>
                <button onClick={() => markWatched(i)} className="btn ghost rounded-lg px-2.5 py-1 text-[13px]">Mark watched</button>
                <button onClick={() => restore(i)} className="btn ghost rounded-lg px-2.5 py-1 text-[13px]">Back to pipeline</button>
              </Row>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">Archive</h1>
            <p className="text-muted">{rows.length} of {archived?.length ?? 0} items</p>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className="field">
            <option value="all">All pipelines</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} className="field">
            <option value="all">Watched and dropped</option>
            <option value="watched">Watched</option>
            <option value="dropped">Dropped</option>
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="field">
            <option value={0}>All time</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or channel" className="field min-w-[220px] flex-1" />
        </div>

        <ul className="flex flex-col gap-0.5">
          {rows.map((i) => (
            <Row key={i.id} item={i} meta={[i.channel, i.durationSec && formatDuration(i.durationSec), i.status, name(i.pipelineId), i.decidedAt && `${age(i.decidedAt)} ago`]}>
              <RestoreMenu item={i} pipelines={pipelines} onPick={(to) => restore(i, to)} />
            </Row>
          ))}
        </ul>
        {archived && !rows.length && <p className="text-faint">{archived.length ? 'Nothing matches these filters.' : 'Nothing archived yet. Watched and dropped videos land here.'}</p>}
      </section>
    </div>
  );
}

function Row({ item, meta, children }: { item: Item; meta: (string | number | false | undefined)[]; children: React.ReactNode }) {
  return (
    <li className="group flex items-center gap-3 rounded-[10px] p-2 hover:bg-hover">
      <img src={item.thumbnailUrl} alt="" className={`h-10 w-[72px] flex-none rounded-md bg-raised object-cover ${item.status === 'dropped' ? 'opacity-60' : ''}`} />
      <div className="flex min-w-0 flex-1 flex-col">
        <a href={item.url} target="_blank" rel="noreferrer" className="truncate font-medium text-text hover:underline">{item.title}</a>
        <span className="truncate text-xs text-muted">{meta.filter(Boolean).join(' · ')}</span>
      </div>
      <div className="flex gap-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">{children}</div>
    </li>
  );
}

function RestoreMenu({ item, pipelines, onPick }: { item: Item; pipelines: Pipeline[]; onPick: (to?: string) => void }) {
  const [open, setOpen] = useState(false);
  const own = pipelines.some((p) => p.id === item.pipelineId);
  return (
    <div className="relative flex gap-1.5">
      <button onClick={() => (own ? onPick() : setOpen(true))} className="btn ghost rounded-lg px-2.5 py-1 text-[13px]">Restore</button>
      <button onClick={() => setOpen((o) => !o)} aria-label="Restore to another pipeline" aria-expanded={open} className="btn ghost rounded-lg px-2 py-1 text-[13px]">▾</button>
      {open && (
        <div role="menu" onMouseLeave={() => setOpen(false)} className="absolute top-full right-0 z-10 mt-1 flex min-w-[160px] flex-col rounded-[10px] border border-border bg-raised p-1 shadow-[0_16px_40px_rgba(0,0,0,.35)]">
          {pipelines.map((p) => (
            <button key={p.id} role="menuitem" onClick={() => { setOpen(false); onPick(p.id); }} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-chip">
              <PipelineDot pipeline={p} size={8} /> {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
