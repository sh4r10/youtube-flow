import { useState } from 'react';
import { PROVIDERS } from '@/lib/ai/providers';
import { aiConfigured, summarize } from '@/lib/ai/summarize';
import { useSettings } from '@/lib/settings';
import type { Item } from '@/lib/types';

const VERDICT_CLASS: Record<string, string> = {
  'worth it': 'bg-[color-mix(in_srgb,var(--good)_14%,transparent)] text-good',
  'skim it': 'bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] text-warn-text',
};

/** AI summary on the decision card: on-demand, cached on the item, never blocks the decision. */
export function SummaryPanel({ item }: { item: Item }) {
  const [{ ai }] = useSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provider = PROVIDERS[ai.provider];
  const s = item.summary;

  if (!s) {
    const ready = aiConfigured(ai);
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={busy || !ready}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await summarize(item, ai); // the live query re-renders the card with item.summary
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="btn ghost flex items-center gap-2 rounded-[10px] px-3.5 py-2 font-medium"
        >
          {busy ? 'Summarizing…' : 'Summarize'}
          <span className="font-normal text-muted">· {provider.label}</span>
        </button>
        {!ready && (
          <span className="text-[12.5px] text-faint">
            Add a {provider.label} API key in <a href="#/settings" className="text-muted underline hover:text-text">Settings</a>
          </span>
        )}
        {error && <span className="text-[12.5px] text-warn-text">{error}</span>}
      </div>
    );
  }

  const pill = VERDICT_CLASS[s.verdict.toLowerCase()] ?? 'bg-chip text-muted';
  return (
    <div className="rise flex flex-col gap-3 rounded-xl border border-border bg-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium tracking-[.06em] text-faint uppercase">AI summary · {s.provider}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill}`}>{s.verdict}</span>
      </div>
      <p className="font-medium">{s.tldr}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-muted">
        {s.points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      {!!s.stamps.length && (
        <div className="flex flex-wrap gap-1.5">
          {s.stamps.map((st, i) => (
            <a
              key={i}
              href={`${item.url}&t=${toSeconds(st.t)}s`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-md bg-chip px-2 py-0.5 text-xs text-muted hover:text-text"
            >
              <span className="font-mono text-text">{st.t}</span>
              {st.label}
            </a>
          ))}
        </div>
      )}
      {s.why && <p className="text-[13px] text-faint">{s.why}</p>}
    </div>
  );
}

function toSeconds(t: string) {
  return t.split(':').reduce((acc, n) => acc * 60 + (Number(n) || 0), 0);
}
