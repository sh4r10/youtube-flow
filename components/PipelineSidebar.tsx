import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { PipelineDot } from '@/components/PipelineDot';
import { createPipeline, queuedCounts } from '@/lib/pipeline';
import { go, type View } from '@/lib/route';
import type { Pipeline } from '@/lib/types';

/** Pipeline list shared by Process and Pipelines views: switch in place, no tab change. */
export function PipelineSidebar({ pipelines, current, view }: { pipelines: Pipeline[]; current: Pipeline; view: View }) {
  const counts = useLiveQuery(() => queuedCounts(pipelines), [pipelines]);
  const [naming, setNaming] = useState(false);

  return (
    <nav aria-label="Pipelines" className="flex flex-col gap-0.5">
      {pipelines.map((p) => {
        const n = counts?.[p.id] ?? 0;
        const over = p.thresholdWarn != null && n >= p.thresholdWarn;
        return (
          <a
            key={p.id}
            href={`#/${view}/${p.id}`}
            aria-current={p.id === current.id ? 'page' : undefined}
            className="flex items-center justify-between rounded-[9px] px-2.5 py-2 text-text hover:bg-hover aria-[current]:bg-raised"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <PipelineDot pipeline={p} />
              <span className="truncate">{p.name}</span>
            </span>
            <span className={`flex items-center gap-1.5 tabular-nums ${over ? 'text-warn-text' : 'text-muted'}`}>
              {over && <span className="size-1.5 rounded-full bg-warn" />}
              {n}
            </span>
          </a>
        );
      })}
      {naming ? (
        <form
          className="mt-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get('name')?.toString().trim();
            if (!name) return;
            const id = await createPipeline(name);
            setNaming(false);
            go({ view, pipelineId: id });
          }}
        >
          <input name="name" autoFocus placeholder="Pipeline name" onBlur={() => setNaming(false)} className="field w-full" />
        </form>
      ) : (
        <button onClick={() => setNaming(true)} className="mt-2 rounded-[9px] px-2.5 py-2 text-left text-muted hover:bg-hover">
          New pipeline…
        </button>
      )}
    </nav>
  );
}
