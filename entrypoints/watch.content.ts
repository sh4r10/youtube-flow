import { browser } from 'wxt/browser';
import type { ItemMeta, Msg } from '@/lib/messages';
import { send } from '@/lib/messages';
import { DEFAULT_SETTINGS, settings } from '@/lib/settings';
import { parseVideoId } from '@/lib/youtube';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  main() {
    let threshold = DEFAULT_SETTINGS.watchedThreshold;
    settings.getValue().then((v) => (threshold = v.watchedThreshold));
    settings.watch((v) => v && (threshold = v.watchedThreshold));
    let reported: string | null = null;

    document.addEventListener(
      'timeupdate',
      (e) => {
        const v = e.target as HTMLVideoElement;
        const id = parseVideoId(location.href);
        if (!id || id === reported || !(v instanceof HTMLVideoElement) || !v.duration) return;
        if (v.currentTime / v.duration >= threshold) {
          reported = id;
          void send({ type: 'watched', videoId: id });
        }
      },
      true,
    );

    browser.runtime.onMessage.addListener((msg: Msg, _s, reply: (m: ItemMeta) => void) => {
      if (msg.type !== 'pageMeta') return;
      const video = document.querySelector('video');
      reply({
        title: document.title.replace(/ - YouTube$/, '') || undefined,
        channel: document.querySelector<HTMLElement>('#owner #channel-name a, ytd-channel-name a')?.textContent?.trim() || undefined,
        durationSec: video?.duration && Number.isFinite(video.duration) ? Math.round(video.duration) : undefined,
      });
    });
  },
});
