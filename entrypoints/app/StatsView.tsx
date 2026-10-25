import { useLiveQuery } from 'dexie-react-hooks';
import { PipelineDot } from '@/components/PipelineDot';
import { db } from '@/lib/db';
import { avgWaitMs, formatDays, formatHours, heatRate, heatRateByPipeline, watchTimeSec, weekly } from '@/lib/stats';
import type { Pipeline } from '@/lib/types';

// Chart series colors, validated with the dataviz palette checker for each surface.
const CHART_CSS = `
:root{--chart-captured:#7585EC;--chart-processed:#3AA26A}
:root[data-theme="light"]{--chart-captured:#4F62F2;--chart-processed:#2E9E63}`;

export function StatsView({ pipelines }: { pipelines: Pipeline[] }) {
  const items = useLiveQuery(() => db.items.toArray());
  if (!items) return null;

  const overall = heatRate(items);
  const wait = avgWaitMs(items);
  const weeks = weekly(items);
  const perPipeline = heatRateByPipeline(items, pipelines);
  const pct = (r: number | null) => (r == null ? '–' : `${Math.round(r * 100)}%`);

  return (
    <div className="flex max-w-[920px] flex-col gap-8">
      <style>{CHART_CSS}</style>
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Stats</h1>
        <p className="text-muted">How captures turn into decisions.</p>
      </div>

      <dl className="grid grid-cols-4 gap-2">
        <Tile label="Heat of the moment" value={pct(overall.rate)} hint={`${overall.dropped} dropped of ${overall.dropped + overall.watched} decided`} />
        <Tile label="Watched" value={String(overall.watched)} hint={`${formatHours(watchTimeSec(items))} of video`} />
        <Tile label="Dropped" value={String(overall.dropped)} hint="archived as not worth it" />
        <Tile label="Average wait" value={wait == null ? '–' : formatDays(wait)} hint="capture to decision" />
      </dl>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Captured vs processed, last 8 weeks</h2>
          <ul className="flex gap-4 text-xs text-muted" aria-label="Legend">
            <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: 'var(--chart-captured)' }} />Captured</li>
            <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: 'var(--chart-processed)' }} />Processed</li>
          </ul>
        </div>
        <WeekChart rows={weeks} />
        <table className="mt-3 w-full text-[13px] tabular-nums">
          <thead className="text-left text-xs text-faint">
            <tr><th className="py-1 font-medium">Week of</th><th className="py-1 text-right font-medium">Captured</th><th className="py-1 text-right font-medium">Processed</th></tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.start} className="border-t border-line">
                <td className="py-1">{fmtWeek(w.start)}</td><td className="py-1 text-right">{w.captured}</td><td className="py-1 text-right">{w.processed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Per pipeline</h2>
        <table className="w-full text-[13px] tabular-nums">
          <thead className="text-left text-xs text-faint">
            <tr><th className="py-1 font-medium">Pipeline</th><th className="py-1 text-right font-medium">Watched</th><th className="py-1 text-right font-medium">Dropped</th><th className="py-1 text-right font-medium">Heat of the moment</th></tr>
          </thead>
          <tbody>
            {perPipeline.map(({ pipeline, watched, dropped, rate }) => (
              <tr key={pipeline.id} className="border-t border-line">
                <td className="flex items-center gap-2 py-1.5"><PipelineDot pipeline={pipeline} /> {pipeline.name}</td>
                <td className="py-1.5 text-right">{watched}</td>
                <td className="py-1.5 text-right">{dropped}</td>
                <td className="py-1.5 text-right">{pct(rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="text-2xl font-semibold tracking-[-0.02em] tabular-nums">{value}</dd>
      <dd className="text-xs text-muted">{hint}</dd>
    </div>
  );
}

const fmtWeek = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Grouped columns: 2px surface gap between the pair, 4px rounded caps, square at the baseline. */
function WeekChart({ rows }: { rows: ReturnType<typeof weekly> }) {
  const W = 720, H = 160, PAD_B = 20, PAD_T = 8;
  const max = Math.max(1, ...rows.flatMap((r) => [r.captured, r.processed]));
  const slot = W / rows.length;
  const bw = Math.min(24, (slot - 16) / 2);
  const plotH = H - PAD_B - PAD_T;
  const y = (v: number) => PAD_T + plotH * (1 - v / max);
  const bar = (x: number, v: number, color: string) => {
    if (!v) return null;
    const top = y(v), h = H - PAD_B - top, r = Math.min(4, h);
    const d = `M${x},${H - PAD_B} V${top + r} a${r},${r} 0 0 1 ${r},-${r} h${bw - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${H - PAD_B} Z`;
    return <path d={d} fill={color} />;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Captured and processed items per week">
      <line x1={0} x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--border)" />
      {max > 1 && <line x1={0} x2={W} y1={y(max)} y2={y(max)} stroke="var(--line)" />}
      <text x={0} y={y(max) - 2} fill="var(--faint)" fontSize={10}>{max}</text>
      {rows.map((r, k) => {
        const x0 = k * slot + (slot - (2 * bw + 2)) / 2;
        return (
          <g key={r.start}>
            <title>{`Week of ${fmtWeek(r.start)}: ${r.captured} captured, ${r.processed} processed`}</title>
            <rect x={k * slot} y={0} width={slot} height={H} fill="transparent" />
            {bar(x0, r.captured, 'var(--chart-captured)')}
            {bar(x0 + bw + 2, r.processed, 'var(--chart-processed)')}
            <text x={k * slot + slot / 2} y={H - 6} textAnchor="middle" fill="var(--faint)" fontSize={10}>{fmtWeek(r.start)}</text>
          </g>
        );
      })}
    </svg>
  );
}
