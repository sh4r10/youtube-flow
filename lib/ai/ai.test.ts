import { describe, expect, it } from 'vitest';
import { parseSummaryJson } from './summarize';
import { flattenJson3, parseCaptionTracks, pickTrack } from './transcript';

const HTML = `<script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=x&lang=de","name":{"simpleText":"German"},"vssId":".de","languageCode":"de","isTranslatable":true},{"baseUrl":"https://www.youtube.com/api/timedtext?v=x&lang=en&kind=asr","languageCode":"en","kind":"asr"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=x&lang=en","languageCode":"en"}],"audioTracks":[{"captionTrackIndices":[0,1,2]}],"translationLanguages":[]}}};</script>`;

describe('transcript', () => {
  it('parses caption tracks and prefers human English', () => {
    const tracks = parseCaptionTracks(HTML);
    expect(tracks).toHaveLength(3);
    expect(pickTrack(tracks)?.baseUrl).toBe('https://www.youtube.com/api/timedtext?v=x&lang=en');
    expect(parseCaptionTracks('<html>no captions</html>')).toEqual([]);
  });

  it('flattens json3 with markers every 30s', () => {
    const text = flattenJson3({
      events: [
        { tStartMs: 0, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
        { tStartMs: 12_000, segs: [{ utf8: '\n' }] },
        { tStartMs: 15_000, segs: [{ utf8: 'second' }] },
        { tStartMs: 31_000, segs: [{ utf8: 'third' }] },
        { tStartMs: 3_661_000, segs: [{ utf8: 'late' }] },
      ],
    });
    expect(text).toBe('[0:00] Hello world second [0:31] third [1:01:01] late');
  });
});

describe('parseSummaryJson', () => {
  it('strips fences and prose, fills defaults', () => {
    const s = parseSummaryJson('Sure:\n```json\n{"tldr":"T","points":["a",2],"stamps":[{"t":"1:00","label":"x"},{"nope":1}]}\n```');
    expect(s).toEqual({ tldr: 'T', points: ['a', '2'], stamps: [{ t: '1:00', label: 'x' }], verdict: 'Skim it', why: '' });
    expect(() => parseSummaryJson('nothing here')).toThrow('no JSON');
  });
});
