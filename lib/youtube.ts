// No extension or DB imports: this file is shared with content scripts.

const ID_RE = /^[\w-]{11}$/;
const valid = (id: string | null | undefined) => (id && ID_RE.test(id) ? id : null);

/** Video id for a regular YouTube video URL. Shorts, playlists and live pages return null. */
export function parseVideoId(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  if (host === 'youtu.be') return valid(u.pathname.slice(1));
  if (host !== 'youtube.com') return null;
  if (u.pathname === '/watch') return valid(u.searchParams.get('v'));
  return null;
}

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** "1:02:03" or "12:34" to seconds. */
export function parseDuration(text: string | null | undefined): number | undefined {
  const parts = (text ?? '').trim().split(':').map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0) || undefined;
}

export function formatDuration(sec: number | undefined): string {
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export async function fetchOEmbed(videoId: string) {
  const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl(videoId))}&format=json`);
  if (!r.ok) throw new Error(`oembed ${r.status}`);
  const j = (await r.json()) as { title: string; author_name: string; thumbnail_url: string };
  return { title: j.title, channel: j.author_name, thumbnailUrl: j.thumbnail_url };
}

export const thumbUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
