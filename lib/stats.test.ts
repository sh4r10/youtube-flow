import { describe, expect, it } from 'vitest';
import { avgWaitMs, heatRate, watchTimeSec, weekStart, weekly } from './stats';
import type { Item } from './types';

const DAY = 86_400_000;
const base: Item = { id: '', url: '', kind: 'youtube-video', videoId: '', title: '', channel: '', thumbnailUrl: '', pipelineId: 'inbox', status: 'queued', order: 0, addedAt: 0, captureMethod: 'menu' };
const mk = (p: Partial<Item>): Item => ({ ...base, ...p });

describe('stats', () => {
  const now = new Date(2026, 9, 25, 12).getTime(); // Sunday
  const items = [
    mk({ status: 'watched', addedAt: now - 10 * DAY, decidedAt: now - 2 * DAY, durationSec: 600 }),
    mk({ status: 'dropped', addedAt: now - 3 * DAY, decidedAt: now - DAY }),
    mk({ status: 'watched', addedAt: now - 20 * DAY, decidedAt: now - 16 * DAY, durationSec: 1200 }),
    mk({ status: 'queued', addedAt: now - DAY }),
  ];

  it('heat rate', () => {
    expect(heatRate(items)).toEqual({ watched: 2, dropped: 1, rate: 1 / 3 });
    expect(heatRate([]).rate).toBeNull();
  });

  it('week start is Monday', () => {
    expect(new Date(weekStart(now)).getDay()).toBe(1);
    expect(weekStart(now)).toBe(new Date(2026, 9, 19).getTime());
  });

  it('weekly buckets', () => {
    const rows = weekly(items, 8, now);
    expect(rows).toHaveLength(8);
    expect(rows[7]).toMatchObject({ captured: 2, processed: 2 }); // this week: dropped + queued captured, watched + dropped decided
    expect(rows[6]).toMatchObject({ captured: 1, processed: 0 }); // last week: first watched captured
    expect(rows.reduce((a, r) => a + r.processed, 0)).toBe(3);
  });

  it('wait and watch time', () => {
    expect(avgWaitMs(items)).toBe(((8 + 2 + 4) / 3) * DAY);
    expect(avgWaitMs([])).toBeNull();
    expect(watchTimeSec(items)).toBe(1800);
  });
});
