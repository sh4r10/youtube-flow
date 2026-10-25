import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import { PipelineDot } from '@/components/PipelineDot';
import { PipelineSidebar } from '@/components/PipelineSidebar';
import { SummaryPanel } from '@/components/SummaryPanel';
import { age } from '@/lib/format';
import { decide, queuedIn, restore, type Decision } from '@/lib/pipeline';
import { go } from '@/lib/route';
import { useSettings } from '@/lib/settings';
import type { Item, Pipeline } from '@/lib/types';
import { formatDuration } from '@/lib/youtube';

type Stats = { watched: number; dropped: number; moved: number; kept: number };
const LABEL: Record<Decision['kind'], string> = { watch: 'Opened in a new tab', keep: 'Sent to the back', move: 'Moved to', drop: 'Dropped' };
const STAT_KEY: Record<Decision['kind'], keyof Stats> = { watch: 'watched', drop: 'dropped', move: 'moved', keep: 'kept' };

export function ProcessView({ pipeline, pipelines, itemId }: { pipeline: Pipeline; pipelines: Pipeline[]; itemId?: string }) {
  const items = useLiveQuery(() => queuedIn(pipeline.id), [pipeline.id]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [stats, setStats] = useState<Stats>({ watched: 0, dropped: 0, moved: 0, kept: 0 });
  const [cfg] = useSettings();
  const startCount = useRef<Record<string, number>>({});
  const lastUndo = useRef<(() => Promise<void>) | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (items && startCount.current[pipeline.id] == null) startCount.current[pipeline.id] = items.length;
  }, [items, pipeline.id]);

  // Jump puts one item in front without reordering the pipeline.
  const jumped = itemId ? items?.find((i) => i.id === itemId) : undefined;
  const cur = jumped ?? items?.[0];
  const upNext = (items ?? []).filter((i) => i.id !== cur?.id).slice(0, 6);

  async function act(d: Decision) {
    if (!cur) return;
    setMoveOpen(false);
    if (d.kind === 'watch') await browser.tabs.create({ url: cur.url, active: false });
    const prev = await decide(cur, d);
    const key = STAT_KEY[d.kind];
    setStats((s) => ({ ...s, [key]: s[key] + 1 }));
    if (jumped) go({ view: 'process', pipelineId: pipeline.id });
    const undo = async () => {
      await restore(prev);
      setStats((s) => ({ ...s, [key]: s[key] - 1 }));
      lastUndo.current = null;
      toast.dismiss(prev.id);
    };
    lastUndo.current = undo;
    const target = d.kind === 'move' ? pipelines.find((p) => p.id === d.pipelineId)?.name : '';
    toast(`${LABEL[d.kind]}${target ? ` ${target}` : ''}`, { id: prev.id, description: cur.title, action: { label: `Undo (${cfg.shortcuts.undo.toUpperCase()})`, onClick: () => void undo() } });
  }

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.metaKey || e.ctrlKey || e.altKey || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      const s = cfg.shortcuts;
      if (k === s.watch) void act({ kind: 'watch' });
      else if (k === s.keep) void act({ kind: 'keep' });
      else if (k === s.drop) void act({ kind: 'drop' });
      else if (k === s.move) setMoveOpen((o) => !o);
      else if (k === s.undo) void lastUndo.current?.();
      else if (k === 'escape') setMoveOpen(false);
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  });

  if (!items) return null;
  const total = startCount.current[pipeline.id] ?? items.length;
  const pct = total ? Math.min(100, Math.round(((total - items.length) / total) * 100)) : 100;

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)_300px] gap-10">
      <PipelineSidebar pipelines={pipelines} current={pipeline} view="process" />

      <section aria-label="Decision" className="flex flex-col gap-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-medium tracking-[.06em] text-faint uppercase">Processing</p>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{pipeline.name}</h1>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[12.5px] text-muted tabular-nums">{items.length ? `${items.length} left` : 'All done'}</span>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        <AnimatePresence mode="popLayout" initial={false}>
          {cur ? (
            <motion.div
              key={cur.id}
              initial={reduce ? false : { opacity: 0, y: 10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.98 }}
              transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              className="flex flex-col gap-4"
            >
              <Card item={cur} pipeline={pipeline} />
              <div className="grid grid-cols-4 gap-2.5">
                <Btn onClick={() => act({ kind: 'drop' })} k={cfg.shortcuts.drop}>Drop</Btn>
                <Btn onClick={() => act({ kind: 'keep' })} k={cfg.shortcuts.keep}>Keep</Btn>
                <Btn onClick={() => setMoveOpen((o) => !o)} k={cfg.shortcuts.move} aria-expanded={moveOpen}>Move</Btn>
                <Btn primary onClick={() => act({ kind: 'watch' })} k={cfg.shortcuts.watch}>Watch</Btn>
              </div>
              {moveOpen && (
                <div className="rise flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
                  <span className="mr-1 text-[12.5px] text-faint">Move to</span>
                  {pipelines
                    .filter((p) => p.id !== pipeline.id)
                    .map((p) => (
                      <button key={p.id} onClick={() => act({ kind: 'move', pipelineId: p.id })} className="btn ghost flex items-center gap-2 rounded-lg px-3 py-1.5">
                        <PipelineDot pipeline={p} /> {p.name}
                      </button>
                    ))}
                  {pipelines.length < 2 && <span className="text-muted">No other pipelines yet. Add one in the sidebar.</span>}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-8 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--good)_14%,transparent)] text-good">
                <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>
              </span>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">{pipeline.name} is clear</h2>
              <p className="text-muted">
                {stats.watched} watched · {stats.dropped} dropped · {stats.moved} moved
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <aside aria-label="Up next" className="flex flex-col gap-8">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold">Up next</h2>
            <span className="text-xs text-faint">Click to jump</span>
          </div>
          <ol className="flex flex-col gap-0.5">
            {upNext.map((u) => (
              <li key={u.id}>
                <button onClick={() => go({ view: 'process', pipelineId: pipeline.id, itemId: u.id })} className="flex w-full items-center gap-3 rounded-[10px] p-2 text-left hover:bg-hover">
                  <img src={u.thumbnailUrl} alt="" className="h-9 w-16 flex-none rounded-md bg-raised object-cover" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13.5px] font-medium">{u.title}</span>
                    <span className="truncate text-xs text-muted">
                      {u.channel}
                      {u.durationSec ? ` · ${formatDuration(u.durationSec)}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {!upNext.length && <p className="text-[13px] text-faint">Nothing after this one.</p>}
        </div>
        <div>
          <h2 className="mb-2 font-semibold">This session</h2>
          <dl className="grid grid-cols-2 gap-2">
            {(['watched', 'dropped', 'moved', 'kept'] as const).map((k) => (
              <div key={k} className="rounded-[10px] border border-border bg-surface px-3 py-2">
                <dt className="text-xs text-faint capitalize">{k}</dt>
                <dd className="text-lg font-semibold tabular-nums">{stats[k]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}

function Card({ item, pipeline }: { item: Item; pipeline: Pipeline }) {
  return (
    <article aria-label="Current video" className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="relative aspect-video bg-raised">
        <img src={item.thumbnailUrl} alt="" className="size-full object-cover" />
        {item.durationSec ? (
          <span className="absolute right-3 bottom-3 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white">{formatDuration(item.durationSec)}</span>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg leading-snug font-semibold tracking-[-0.01em]">{item.title}</h2>
          <p className="text-muted">
            {[item.channel, item.durationSec && formatDuration(item.durationSec), `${age(item.addedAt)} in ${pipeline.name}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <SummaryPanel item={item} />
      </div>
    </article>
  );
}

function Btn({ k, primary, children, ...rest }: { k: string; primary?: boolean; children: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`btn ${primary ? 'primary' : 'ghost'} flex h-12 items-center justify-center gap-2 rounded-xl font-medium`}>
      {children}
      <kbd className={`rounded-[5px] px-1.5 font-mono text-[11px] ${primary ? 'bg-black/15' : 'bg-chip text-muted'}`}>{k.toUpperCase()}</kbd>
    </button>
  );
}
