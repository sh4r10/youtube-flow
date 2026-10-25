import { db } from '../db';
import type { Item, Settings, Summary } from '../types';
import { formatDuration } from '../youtube';
import { PROVIDERS } from './providers';
import { fetchTranscript } from './transcript';

type AiSettings = Settings['ai'];

export function aiConfigured(ai: AiSettings): boolean {
  return !PROVIDERS[ai.provider].needsKey || !!ai.apiKey.trim();
}

const SYSTEM = `You summarize YouTube video transcripts so the viewer can decide whether to watch.
Reply with ONLY a JSON object, no prose, no code fences, with exactly these keys:
{"tldr": "one sentence", "points": ["3 to 5 key points"], "stamps": [{"t": "mm:ss", "label": "2-4 word section name"}], "verdict": "Worth it" | "Skim it" | "Skip", "why": "one short sentence justifying the verdict"}
Use the [mm:ss] markers in the transcript for "stamps" (3 to 5 of them). Be concrete and terse.`;

function prompt(item: Item, transcript: string) {
  const meta = [item.title, item.channel && `by ${item.channel}`, item.durationSec && formatDuration(item.durationSec)].filter(Boolean).join(' · ');
  // shortcut: hard cap ~120k chars (~30k tokens) keeps every provider under its context limit; chunk if long talks matter.
  return `Video: ${meta}\n\nTranscript:\n${transcript.slice(0, 120_000)}`;
}

/** Pulls the JSON object out of a model reply that may be wrapped in fences or prose. */
export function parseSummaryJson(text: string): Omit<Summary, 'provider'> {
  const stripped = text.replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Model reply had no JSON');
  const j = JSON.parse(stripped.slice(start, end + 1)) as Partial<Summary>;
  if (typeof j.tldr !== 'string' || !Array.isArray(j.points)) throw new Error('Model reply missing tldr or points');
  return {
    tldr: j.tldr,
    points: j.points.map(String),
    stamps: (Array.isArray(j.stamps) ? j.stamps : []).filter((s) => s && typeof s.t === 'string').map((s) => ({ t: s.t, label: String(s.label ?? '') })),
    verdict: typeof j.verdict === 'string' ? j.verdict : 'Skim it',
    why: typeof j.why === 'string' ? j.why : '',
  };
}

async function post(url: string, headers: Record<string, string>, body: unknown, label: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error(`${label}: could not reach ${new URL(url).host} (${(e as Error).message})`);
  }
  if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function complete(ai: AiSettings, user: string): Promise<string> {
  const model = ai.model.trim() || PROVIDERS[ai.provider].defaultModel;
  const label = PROVIDERS[ai.provider].label;
  switch (ai.provider) {
    case 'anthropic': {
      const j = (await post(
        'https://api.anthropic.com/v1/messages',
        { 'x-api-key': ai.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        { model, max_tokens: 4096, system: SYSTEM, output_config: { effort: 'low' }, messages: [{ role: 'user', content: user }] },
        label,
      )) as { content: { type: string; text?: string }[]; stop_reason?: string };
      if (j.stop_reason === 'refusal') throw new Error('Claude declined to summarize this video');
      return j.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    }
    case 'openai':
    case 'deepseek': {
      const base = ai.provider === 'openai' ? 'https://api.openai.com' : 'https://api.deepseek.com';
      const j = (await post(
        `${base}/v1/chat/completions`,
        { authorization: `Bearer ${ai.apiKey}` },
        { model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] },
        label,
      )) as { choices: { message: { content: string } }[] };
      return j.choices[0]?.message.content ?? '';
    }
    case 'ollama': {
      const j = (await post(
        `${ai.ollamaUrl.replace(/\/$/, '')}/api/chat`,
        {},
        { model, stream: false, format: 'json', messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] },
        label,
      )) as { message: { content: string } };
      return j.message.content;
    }
  }
}

/** Transcript → provider → parsed summary, cached on the item so it is only generated once. */
export async function summarize(item: Item, ai: AiSettings): Promise<Summary> {
  if (!aiConfigured(ai)) throw new Error(`${PROVIDERS[ai.provider].label} needs an API key in Settings`);
  const transcript = await fetchTranscript(item.videoId);
  const summary: Summary = { provider: PROVIDERS[ai.provider].label, ...parseSummaryJson(await complete(ai, prompt(item, transcript))) };
  await db.items.update(item.id, { summary });
  return summary;
}
