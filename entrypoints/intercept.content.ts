import { showCapturePanel } from '@/lib/capture-ui';
import { send } from '@/lib/messages';
import { DEFAULT_SETTINGS, settings } from '@/lib/settings';
import type { Settings } from '@/lib/types';
import { parseDuration, parseVideoId } from '@/lib/youtube';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    let cfg: Settings = DEFAULT_SETTINGS;
    settings.getValue().then((v) => (cfg = v));
    settings.watch((v) => (cfg = v ?? DEFAULT_SETTINGS));

    const onClick = (e: MouseEvent) => {
      if (!cfg.intercept || e.shiftKey || e.defaultPrevented) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || !parseVideoId(a.href)) return;
      const middle = e.button === 1;
      const modLeft = e.button === 0 && (e.ctrlKey || e.metaKey);
      const plainLeft = e.button === 0 && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (!(middle || modLeft || (cfg.interceptLeftClick && plainLeft))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void capture(a);
    };
    // Chrome opens the tab on auxclick, Firefox on click; intercept both, and mousedown so YouTube's own handlers never see it.
    document.addEventListener('auxclick', onClick, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousedown', (e) => e.button === 1 && cfg.intercept && !e.shiftKey && e.preventDefault(), true);
  },
});

async function capture(a: HTMLAnchorElement) {
  // Duration badge lives in the surrounding video renderer on YouTube pages.
  const card = a.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model');
  const durationSec = parseDuration(card?.querySelector('ytd-thumbnail-overlay-time-status-renderer, .badge-shape-wiz__text')?.textContent);
  const res = await send({ type: 'capture', url: a.href, method: 'intercept', meta: { durationSec } });
  if (res.kind === 'ignored') return;
  const item = res.item;
  showCapturePanel({
    title: res.kind === 'duplicate' ? `Already in ${res.pipeline.name}` : `Added to ${res.pipeline.name}`,
    subtitle: item.title + (res.kind === 'added' && res.viaRule ? ' · rule' : ''),
    thumb: item.thumbnailUrl,
    pipelines: res.pipelines,
    currentId: res.pipeline.id,
    onMove: (pipelineId) => send({ type: 'moveItem', itemId: item.id, pipelineId }),
    onUndo: res.kind === 'added' ? () => void send({ type: 'undoCapture', itemId: item.id }) : undefined,
  });
}
