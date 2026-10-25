import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { PipelineDot } from '@/components/PipelineDot';
import { db, INBOX_ID } from '@/lib/db';
import { send } from '@/lib/messages';
import { queuedCounts } from '@/lib/pipeline';
import { useSettings, useTheme } from '@/lib/settings';

export function App() {
  useTheme();
  const pipelines = useLiveQuery(() => db.pipelines.orderBy('order').toArray());
  const counts = useLiveQuery(() => queuedCounts(pipelines ?? []), [pipelines]);
  const [ytTabs, setYtTabs] = useState(0);
  const [cfg, update] = useSettings();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => void send({ type: 'countYouTubeTabs' }).then(setYtTabs), []);

  const inbox = counts?.[INBOX_ID] ?? 0;
  const open = (hash: string) => send({ type: 'openApp', hash }).then(() => window.close());
  const run = async (what: 'queueTab' | 'sweep') => {
    setBusy(what);
    await send({ type: what });
    setBusy(null);
    if (what === 'sweep') setYtTabs(await send({ type: 'countYouTubeTabs' }));
  };

  return (
    <div className="flex h-[560px] w-[360px] flex-col bg-ground">
      <header className="flex items-center justify-between border-b border-line px-4 py-3.5">
        <span className="flex items-center gap-2.5 font-semibold">
          <Logo /> Flow
        </span>
        <button aria-label="Open full page" onClick={() => open('#/pipelines')} className="btn flex size-8 items-center justify-center rounded-lg border border-transparent text-muted hover:border-border-hi hover:bg-chip">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 3h4v4M13 3L7.5 8.5M12 9.5V13H3V4h3.5" />
          </svg>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 p-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-hover p-4">
          <div>
            <p className="text-xs font-medium tracking-[.06em] text-faint uppercase">Inbox</p>
            <p className="text-[28px] leading-[1.2] font-semibold tracking-[-0.02em] tabular-nums">
              {inbox}
              <span className="text-sm font-normal tracking-normal text-muted"> to sort</span>
            </p>
          </div>
          <button onClick={() => open(`#/process/${INBOX_ID}`)} className="btn primary rounded-[10px] px-3.5 py-2">
            Process
          </button>
        </div>

        <ul className="flex flex-col gap-0.5 overflow-y-auto">
          {pipelines
            ?.filter((p) => !p.isInbox)
            .map((p) => {
              const n = counts?.[p.id] ?? 0;
              const over = p.thresholdWarn != null && n >= p.thresholdWarn;
              return (
                <li key={p.id}>
                  <button onClick={() => open(`#/process/${p.id}`)} className="flex w-full items-center justify-between rounded-[9px] px-2.5 py-2 text-left hover:bg-hover">
                    <span className="flex items-center gap-2.5">
                      <PipelineDot pipeline={p} />
                      {p.name}
                    </span>
                    <span className={`flex items-center gap-1.5 tabular-nums ${over ? 'text-warn-text' : 'text-muted'}`}>
                      {over && <span className="size-1.5 rounded-full bg-warn" />}
                      {n}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>

        <div className="mt-auto flex flex-col gap-2">
          <button disabled={busy !== null} onClick={() => run('queueTab')} className="btn ghost flex h-11 items-center gap-2.5 rounded-[10px] px-3.5 text-left font-medium">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10" />
            </svg>
            Capture this tab and close it
          </button>
          <button disabled={busy !== null || !ytTabs} onClick={() => run('sweep')} className="btn ghost flex h-11 items-center gap-2.5 rounded-[10px] px-3.5 text-left font-medium">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 4.5h11v8h-11zM5 2.5h6" />
            </svg>
            <span className="flex-1">{busy === 'sweep' ? 'Sweeping…' : 'Sweep open YouTube tabs'}</span>
            <span className="text-[12.5px] text-muted tabular-nums">{ytTabs}</span>
          </button>
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <label htmlFor="intercept" className="flex cursor-pointer flex-col">
          <span className="font-medium">Intercept new tabs</span>
          <span className="text-xs text-faint">Shift + middle-click opens normally</span>
        </label>
        <input id="intercept" type="checkbox" className="size-5 cursor-pointer accent-accent" checked={cfg.intercept} onChange={(e) => void update({ intercept: e.target.checked })} />
      </footer>
    </div>
  );
}
