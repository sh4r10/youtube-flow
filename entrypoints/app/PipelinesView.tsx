import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { PipelineSidebar } from '@/components/PipelineSidebar';
import { db } from '@/lib/db';
import { METHOD_LABEL, age } from '@/lib/format';
import { decide, deletePipeline, movePipeline, queuedIn, restore } from '@/lib/pipeline';
import { go } from '@/lib/route';
import type { Pipeline } from '@/lib/types';
import { formatDuration } from '@/lib/youtube';

export function PipelinesView({ pipeline, pipelines }: { pipeline: Pipeline; pipelines: Pipeline[] }) {
  const items = useLiveQuery(() => queuedIn(pipeline.id), [pipeline.id]);
  const rules = useLiveQuery(() => db.rules.where('targetPipelineId').equals(pipeline.id).toArray(), [pipeline.id]);
  const [editing, setEditing] = useState(false);

  async function drop(itemId: string) {
    const item = items?.find((i) => i.id === itemId);
    if (!item) return;
    const prev = await decide(item, { kind: 'drop' });
    toast('Dropped', { description: item.title, action: { label: 'Undo', onClick: () => void restore(prev) } });
  }

  async function remove() {
    if (!confirm(`Delete "${pipeline.name}"? Its ${items?.length ?? 0} queued videos move to the Inbox.`)) return;
    await deletePipeline(pipeline.id);
    go({ view: 'pipelines', pipelineId: 'inbox' });
  }

  const over = pipeline.thresholdWarn != null && (items?.length ?? 0) >= pipeline.thresholdWarn;

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-10">
      <PipelineSidebar pipelines={pipelines} current={pipeline} view="pipelines" />

      <section>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {editing ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const name = f.get('name')?.toString().trim();
                  const t = Number(f.get('threshold'));
                  if (name) await db.pipelines.update(pipeline.id, { name, thresholdWarn: t > 0 ? t : undefined });
                  setEditing(false);
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <input name="name" defaultValue={pipeline.name} autoFocus className="field text-lg font-semibold" />
                <label className="flex items-center gap-2 text-muted">
                  Warn at
                  <input name="threshold" type="number" min={0} defaultValue={pipeline.thresholdWarn ?? ''} placeholder="off" className="field w-20" />
                </label>
                <button className="btn primary rounded-lg px-3 py-1.5">Save</button>
                <button type="button" onClick={() => setEditing(false)} className="btn ghost rounded-lg px-3 py-1.5">Cancel</button>
              </form>
            ) : (
              <>
                <h1 className="truncate text-2xl font-semibold tracking-[-0.02em]">{pipeline.name}</h1>
                <p className="text-muted">
                  {items?.length ?? 0} queued
                  {pipeline.thresholdWarn != null && <span className={over ? 'ml-2 text-warn-text' : 'ml-2'}>· warn at {pipeline.thresholdWarn}</span>}
                  {!!rules?.length && <span className="ml-2">· {rules.length} rule{rules.length > 1 ? 's' : ''} route here</span>}
                </p>
              </>
            )}
          </div>
          {!editing && (
            <div className="flex flex-none items-center gap-1.5">
              {!pipeline.isInbox && (
                <>
                  <IconBtn label="Move up" onClick={() => movePipeline(pipeline.id, -1)}>↑</IconBtn>
                  <IconBtn label="Move down" onClick={() => movePipeline(pipeline.id, 1)}>↓</IconBtn>
                </>
              )}
              <button onClick={() => setEditing(true)} className="btn ghost rounded-lg px-3 py-1.5 text-[13px]">{pipeline.isInbox ? 'Threshold' : 'Edit'}</button>
              {!pipeline.isInbox && <button onClick={remove} className="btn ghost rounded-lg px-3 py-1.5 text-[13px]">Delete</button>}
              {!!items?.length && (
                <button onClick={() => go({ view: 'process', pipelineId: pipeline.id })} className="btn primary rounded-[10px] px-3.5 py-1.5">
                  Process
                </button>
              )}
            </div>
          )}
        </div>

        <ul className="flex flex-col gap-0.5">
          {items?.map((i) => (
            <li key={i.id} className="group flex items-center gap-3 rounded-[10px] p-2 hover:bg-hover">
              <img src={i.thumbnailUrl} alt="" className="h-10 w-[72px] flex-none rounded-md bg-raised object-cover" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{i.title}</span>
                <span className="truncate text-xs text-muted">
                  {[i.channel, i.durationSec && formatDuration(i.durationSec), METHOD_LABEL[i.captureMethod], age(i.addedAt)].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="flex gap-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <button onClick={() => go({ view: 'process', pipelineId: pipeline.id, itemId: i.id })} className="btn ghost rounded-lg px-2.5 py-1 text-[13px]">Jump</button>
                <button onClick={() => drop(i.id)} className="btn ghost rounded-lg px-2.5 py-1 text-[13px]">Drop</button>
              </div>
            </li>
          ))}
        </ul>
        {items && !items.length && <p className="text-faint">Nothing queued here.</p>}
      </section>
    </div>
  );
}

function IconBtn({ label, children, ...rest }: { label: string; children: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} aria-label={label} title={label} className="btn ghost flex size-8 items-center justify-center rounded-lg">
      {children}
    </button>
  );
}
