import { liveQuery, type Subscription } from 'dexie';
import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import { db, ensureInbox, INBOX_ID } from '@/lib/db';
import type { CaptureResult, ItemMeta, Msg } from '@/lib/messages';
import { capture, markWatched, queuedCount, queuedCounts } from '@/lib/pipeline';
import { loadSettings, settings } from '@/lib/settings';
import type { Pipeline, Settings } from '@/lib/types';
import { parseVideoId } from '@/lib/youtube';

const YT_TAB_URLS = ['*://*.youtube.com/watch*', '*://youtu.be/*'];
const MENU_ROOT = 'send-to-pipeline';
// Firefox MV2 exposes browserAction, everything else action.
const action = browser.action ?? (browser as unknown as { browserAction: typeof browser.action }).browserAction;
const appUrl = (hash = '') => browser.runtime.getURL('/app.html') + hash;

async function rebuildMenus(pipelines: Pipeline[]) {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({ id: MENU_ROOT, title: 'Send to pipeline', contexts: ['link'], targetUrlPatterns: YT_TAB_URLS });
  for (const p of pipelines) {
    browser.contextMenus.create({ id: `p:${p.id}`, parentId: MENU_ROOT, title: p.name, contexts: ['link'] });
  }
}

function setBadge(n: number) {
  action.setBadgeText({ text: n ? String(n) : '' });
  action.setBadgeBackgroundColor({ color: '#9AA8FF' });
  action.setBadgeTextColor?.({ color: '#101114' });
}

let badgeSub: Subscription | undefined;
function watchBadge(s: Settings) {
  badgeSub?.unsubscribe();
  badgeSub = liveQuery(() => queuedCount(s.badgeScope === 'inbox' ? INBOX_ID : undefined)).subscribe(setBadge);
}

// Reminders

const notifiedThreshold = storage.defineItem<Record<string, boolean>>('local:notifiedThreshold', { fallback: {} });

function notify(id: string, title: string, message: string) {
  void browser.notifications.create(id, { type: 'basic', iconUrl: browser.runtime.getURL('/icon-128.png'), title, message });
}

async function scheduleAlarms(s: Settings) {
  await browser.alarms.clearAll();
  if (!s.reminders.scheduled.enabled) return;
  for (const t of s.reminders.scheduled.times) {
    const [h, m] = t.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    browser.alarms.create(`scheduled:${t}`, { when: d.getTime(), periodInMinutes: 1440 });
  }
}

async function onAlarm() {
  const s = await loadSettings();
  if (!s.reminders.scheduled.enabled || !s.reminders.scheduled.days.includes(new Date().getDay())) return;
  const n = await queuedCount();
  if (n) notify(`#/process/${INBOX_ID}`, 'YouTube Flow', `You have ${n} video${n === 1 ? '' : 's'} to process`);
}

async function checkThresholds(pipelines: Pipeline[]) {
  const s = await loadSettings();
  if (!s.reminders.threshold.enabled) return;
  const counts = await queuedCounts(pipelines);
  const seen = { ...(await notifiedThreshold.getValue()) };
  for (const p of pipelines) {
    const n = counts[p.id] ?? 0;
    const over = p.thresholdWarn != null && n >= p.thresholdWarn;
    if (over && !seen[p.id]) {
      seen[p.id] = true;
      notify(`#/process/${p.id}`, 'YouTube Flow', `${p.name} has ${n} items`);
    } else if (!over && seen[p.id]) {
      delete seen[p.id]; // re-arm once the pipeline drops back under its threshold
    }
  }
  await notifiedThreshold.setValue(seen);
}

// Messages

async function pageMeta(tabId: number): Promise<ItemMeta> {
  try {
    return (await browser.tabs.sendMessage(tabId, { type: 'pageMeta' } satisfies Msg)) as ItemMeta;
  } catch {
    return {}; // tab has no content script (not loaded yet, or not a watch page)
  }
}

async function queueTab(tab: Browser.tabs.Tab, method: 'button' | 'sweep'): Promise<CaptureResult> {
  if (!tab.id || !tab.url || !parseVideoId(tab.url)) return { kind: 'ignored', reason: 'Not a YouTube video tab' };
  const res = await capture({ url: tab.url, method, meta: await pageMeta(tab.id) });
  if (res.kind !== 'ignored') await browser.tabs.remove(tab.id);
  return res;
}

async function handle(msg: Msg): Promise<unknown> {
  switch (msg.type) {
    case 'capture':
      return capture(msg);
    case 'undoCapture':
      return db.transaction('rw', db.items, db.events, async () => {
        await db.items.delete(msg.itemId);
        await db.events.where('itemId').equals(msg.itemId).delete();
      });
    case 'moveItem':
      return db.items.update(msg.itemId, { pipelineId: msg.pipelineId, order: Date.now() });
    case 'queueTab': {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      return tab ? queueTab(tab, 'button') : { kind: 'ignored', reason: 'No active tab' };
    }
    case 'sweep': {
      const tabs = await browser.tabs.query({ url: YT_TAB_URLS });
      let added = 0;
      for (const t of tabs) if ((await queueTab(t, 'sweep')).kind === 'added') added++;
      return { added, skipped: tabs.length - added };
    }
    case 'countYouTubeTabs':
      return (await browser.tabs.query({ url: YT_TAB_URLS })).length;
    case 'watched':
      return markWatched(msg.videoId);
    case 'openApp':
      return browser.tabs.create({ url: appUrl(msg.hash) });
    case 'pageMeta':
      return; // handled by the watch content script, not here
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => void ensureInbox());
  void loadSettings().then((s) => {
    watchBadge(s);
    void scheduleAlarms(s);
  });
  settings.watch((s) => {
    if (!s) return;
    watchBadge(s);
    void scheduleAlarms(s);
  });

  liveQuery(() => db.pipelines.orderBy('order').toArray()).subscribe((ps) => void rebuildMenus(ps));
  // Re-check thresholds whenever queued items change.
  liveQuery(async () => ({ pipelines: await db.pipelines.toArray(), n: await db.items.where('status').equals('queued').count() })).subscribe(({ pipelines }) => void checkThresholds(pipelines));

  browser.alarms.onAlarm.addListener(() => void onAlarm());
  browser.notifications.onClicked.addListener((id) => {
    browser.notifications.clear(id);
    void browser.tabs.create({ url: appUrl(id.startsWith('#') ? id : '') });
  });

  browser.contextMenus.onClicked.addListener((info) => {
    const id = String(info.menuItemId);
    if (!id.startsWith('p:') || !info.linkUrl) return;
    void capture({ url: info.linkUrl, method: 'menu', pipelineId: id.slice(2) });
  });

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    handle(msg as Msg).then(sendResponse, (e) => sendResponse({ kind: 'ignored', reason: String(e) }));
    return true;
  });
});
