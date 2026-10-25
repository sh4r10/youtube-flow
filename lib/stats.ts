import type { Item, Pipeline } from './types';

export interface Rate {
  watched: number;
  dropped: number;
  /** dropped / (dropped + watched); null when nothing was decided. */
  rate: number | null;
}

export function heatRate(items: Item[]): Rate {
  const watched = items.filter((i) => i.status === 'watched').length;
  const dropped = items.filter((i) => i.status === 'dropped').length;
  return { watched, dropped, rate: watched + dropped ? dropped / (watched + dropped) : null };
}

export function heatRateByPipeline(items: Item[], pipelines: Pipeline[]) {
  return pipelines.map((p) => ({ pipeline: p, ...heatRate(items.filter((i) => i.pipelineId === p.id)) }));
}

/** Monday 00:00 local of the ISO week containing t. */
export function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export interface WeekRow {
  start: number;
  captured: number;
  processed: number;
}

export function weekly(items: Item[], weeks = 8, now = Date.now()): WeekRow[] {
  const cur = weekStart(now);
  const rows: WeekRow[] = Array.from({ length: weeks }, (_, k) => ({ start: weekStart(cur - (weeks - 1 - k) * 7 * 86_400_000 + 1), captured: 0, processed: 0 }));
  const idx = new Map(rows.map((r, k) => [r.start, k]));
  for (const i of items) {
    const c = idx.get(weekStart(i.addedAt));
    if (c != null) rows[c].captured++;
    if ((i.status === 'watched' || i.status === 'dropped') && i.decidedAt) {
      const p = idx.get(weekStart(i.decidedAt));
      if (p != null) rows[p].processed++;
    }
  }
  return rows;
}

/** Mean ms between capture and a watch/drop decision; null when none. */
export function avgWaitMs(items: Item[]): number | null {
  const done = items.filter((i) => (i.status === 'watched' || i.status === 'dropped') && i.decidedAt);
  return done.length ? done.reduce((a, i) => a + (i.decidedAt! - i.addedAt), 0) / done.length : null;
}

export const watchTimeSec = (items: Item[]) => items.filter((i) => i.status === 'watched').reduce((a, i) => a + (i.durationSec ?? 0), 0);

export function formatHours(sec: number): string {
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(sec < 36000 ? 1 : 0)} h`;
}

export function formatDays(ms: number): string {
  const d = ms / 86_400_000;
  if (d < 1) return `${Math.max(1, Math.round(d * 24))} h`;
  return `${d.toFixed(d < 10 ? 1 : 0)} days`;
}
