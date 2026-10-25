// Captions for a video, read the way the watch page reads them: no API key, cookies travel with the request.

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string; // "asr" = auto-generated
}

export const NO_TRANSCRIPT = 'No transcript available';

/** Pulls captionTracks out of the watch page HTML without parsing the whole player response. */
export function parseCaptionTracks(html: string): CaptionTrack[] {
  const m = html.match(/"captionTracks":(\[.*?\])(?=,"(?:audioTracks|translationLanguages|defaultAudioTrackIndex)")/s);
  if (!m) return [];
  try {
    return (JSON.parse(m[1]) as CaptionTrack[]).filter((t) => typeof t.baseUrl === 'string');
  } catch {
    return [];
  }
}

/** English first, human-made before auto-generated, else the first track. */
export function pickTrack(tracks: CaptionTrack[]): CaptionTrack | undefined {
  const score = (t: CaptionTrack) => (t.languageCode.startsWith('en') ? 2 : 0) + (t.kind === 'asr' ? 0 : 1);
  return [...tracks].sort((a, b) => score(b) - score(a))[0];
}

interface Json3 {
  events?: { tStartMs: number; segs?: { utf8: string }[] }[];
}

/** Flattens json3 captions to text with a [mm:ss] marker roughly every 30 seconds. */
export function flattenJson3(data: Json3, markerEveryMs = 30_000): string {
  const out: string[] = [];
  let nextMarker = 0;
  for (const ev of data.events ?? []) {
    const text = (ev.segs ?? [])
      .map((s) => s.utf8)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    if (ev.tStartMs >= nextMarker) {
      out.push(`[${stamp(ev.tStartMs)}]`);
      nextMarker = ev.tStartMs - (ev.tStartMs % markerEveryMs) + markerEveryMs;
    }
    out.push(text);
  }
  return out.join(' ');
}

function stamp(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? h + ':' : ''}${h ? String(m).padStart(2, '0') : m}:${String(sec).padStart(2, '0')}`;
}

export async function fetchTranscript(videoId: string): Promise<string> {
  const page = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, { credentials: 'include' });
  if (!page.ok) throw new Error(`YouTube page ${page.status}`);
  const track = pickTrack(parseCaptionTracks(await page.text()));
  if (!track) throw new Error(NO_TRANSCRIPT);
  // shortcut: some videos now need a proof-of-origin token for timedtext and return an empty body; surface it as no transcript, revisit if it becomes common.
  const res = await fetch(`${track.baseUrl}&fmt=json3`, { credentials: 'include' });
  const body = res.ok ? await res.text() : '';
  if (!body) throw new Error(NO_TRANSCRIPT);
  const text = flattenJson3(JSON.parse(body) as Json3);
  if (!text) throw new Error(NO_TRANSCRIPT);
  return text;
}
