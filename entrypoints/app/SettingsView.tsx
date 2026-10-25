import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { PROVIDERS } from '@/lib/ai/providers';
import { exportData, importData } from '@/lib/backup';
import { useSettings } from '@/lib/settings';
import type { AiProvider, ExportFile, Settings } from '@/lib/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORTCUTS: (keyof Settings['shortcuts'])[] = ['watch', 'keep', 'move', 'drop', 'undo'];

export function SettingsView() {
  const [s, update] = useSettings();
  const [includeKeys, setIncludeKeys] = useState(false);
  const [newTime, setNewTime] = useState('09:00');
  const fileRef = useRef<HTMLInputElement>(null);
  const importMode = useRef<'merge' | 'replace'>('merge');
  const provider = PROVIDERS[s.ai.provider];

  const setShortcut = (k: keyof Settings['shortcuts'], v: string) => {
    const key = v.slice(-1).toLowerCase();
    if (!key) return;
    if (Object.entries(s.shortcuts).some(([other, val]) => other !== k && val === key)) {
      toast(`${key.toUpperCase()} is already used`);
      return;
    }
    void update({ shortcuts: { ...s.shortcuts, [k]: key } });
  };

  async function doExport() {
    const data = await exportData({ includeKeys });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `youtube-flow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function pickImport(mode: 'merge' | 'replace') {
    if (mode === 'replace' && !confirm('Replace everything? All pipelines, videos, rules and history in this browser will be deleted first.')) return;
    importMode.current = mode;
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = await importData(JSON.parse(await file.text()) as ExportFile, importMode.current);
      toast('Imported', { description: `${r.pipelines} pipelines, ${r.items} videos, ${r.rules} rules` });
    } catch (err) {
      toast('Import failed', { description: String(err instanceof Error ? err.message : err) });
    }
  }

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Settings</h1>

      <Section title="Capture">
        <Toggle label="Intercept new tabs" hint="Middle-click and Ctrl/Cmd-click on YouTube video links send them to a pipeline. Shift + click opens a tab as usual." checked={s.intercept} onChange={(v) => update({ intercept: v })} />
        <Toggle label="Also intercept plain left-clicks" hint="Changes normal browsing on YouTube: clicking a video captures it instead of playing it." checked={s.interceptLeftClick} onChange={(v) => update({ interceptLeftClick: v })} />
      </Section>

      <Section title="Processing">
        <Row label="Mark watched at" hint="Share of the video played before it counts as watched.">
          <span className="flex items-center gap-3">
            <input type="range" min={50} max={100} step={5} value={Math.round(s.watchedThreshold * 100)} onChange={(e) => update({ watchedThreshold: Number(e.target.value) / 100 })} className="accent-accent" />
            <span className="w-10 text-right tabular-nums">{Math.round(s.watchedThreshold * 100)}%</span>
          </span>
        </Row>
        <Row label="Shortcuts" hint="One key each, used on the decision card.">
          <span className="flex gap-2">
            {SHORTCUTS.map((k) => (
              <label key={k} className="flex flex-col items-center gap-1 text-[11px] text-faint capitalize">
                {k}
                <input value={s.shortcuts[k].toUpperCase()} onChange={(e) => setShortcut(k, e.target.value)} onFocus={(e) => e.target.select()} aria-label={`${k} shortcut`} className="field w-10 text-center font-mono text-sm text-text uppercase" />
              </label>
            ))}
          </span>
        </Row>
      </Section>

      <Section title="Badge and appearance">
        <Row label="Badge count shows">
          <Select value={s.badgeScope} onChange={(v) => update({ badgeScope: v as Settings['badgeScope'] })} options={[['all', 'All pipelines'], ['inbox', 'Inbox only']]} />
        </Row>
        <Row label="Theme">
          <Select value={s.theme} onChange={(v) => update({ theme: v as Settings['theme'] })} options={[['dark', 'Dark'], ['light', 'Light'], ['system', 'System']]} />
        </Row>
      </Section>

      <Section title="Reminders">
        <Toggle label="Scheduled notification" hint="“You have N videos to process”, at these times on these days." checked={s.reminders.scheduled.enabled} onChange={(v) => update({ reminders: { ...s.reminders, scheduled: { ...s.reminders.scheduled, enabled: v } } })} />
        <div className="flex flex-wrap items-center gap-2 pl-1">
          {s.reminders.scheduled.times.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-chip py-1 pr-1 pl-3 font-mono text-[13px]">
              {t}
              <button aria-label={`Remove ${t}`} onClick={() => update({ reminders: { ...s.reminders, scheduled: { ...s.reminders.scheduled, times: s.reminders.scheduled.times.filter((x) => x !== t) } } })} className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-border">×</button>
            </span>
          ))}
          <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="field text-[13px]" />
          <button
            onClick={() => newTime && !s.reminders.scheduled.times.includes(newTime) && update({ reminders: { ...s.reminders, scheduled: { ...s.reminders.scheduled, times: [...s.reminders.scheduled.times, newTime].sort() } } })}
            className="btn ghost rounded-lg px-3 py-1.5 text-[13px]"
          >
            Add time
          </button>
        </div>
        <div className="flex gap-1 pl-1">
          {DAYS.map((d, i) => {
            const on = s.reminders.scheduled.days.includes(i);
            return (
              <button
                key={d}
                aria-pressed={on}
                onClick={() => update({ reminders: { ...s.reminders, scheduled: { ...s.reminders.scheduled, days: on ? s.reminders.scheduled.days.filter((x) => x !== i) : [...s.reminders.scheduled.days, i].sort() } } })}
                className={`btn rounded-lg px-2.5 py-1 text-[13px] ${on ? 'primary' : 'ghost'}`}
              >
                {d}
              </button>
            );
          })}
        </div>
        <Toggle label="Threshold notification" hint="“Programming has 25 items” once a pipeline passes its limit. Set each limit in the Pipelines view (Edit)." checked={s.reminders.threshold.enabled} onChange={(v) => update({ reminders: { ...s.reminders, threshold: { enabled: v } } })} />
      </Section>

      <Section title="AI summaries">
        <Row label="Provider">
          <Select value={s.ai.provider} onChange={(v) => update({ ai: { ...s.ai, provider: v as AiProvider } })} options={(Object.keys(PROVIDERS) as AiProvider[]).map((p) => [p, PROVIDERS[p].label])} />
        </Row>
        <Row label="Model">
          <input value={s.ai.model} placeholder={provider.defaultModel} onChange={(e) => update({ ai: { ...s.ai, model: e.target.value } })} className="field w-64" />
        </Row>
        {provider.needsKey && (
          <Row label="API key" hint="Stored in this browser's extension storage only. Left out of backups unless you tick “include API keys”.">
            <input type="password" autoComplete="off" value={s.ai.apiKey} onChange={(e) => update({ ai: { ...s.ai, apiKey: e.target.value } })} className="field w-64" />
          </Row>
        )}
        {s.ai.provider === 'ollama' && (
          <Row label="Ollama URL">
            <input value={s.ai.ollamaUrl} onChange={(e) => update({ ai: { ...s.ai, ollamaUrl: e.target.value } })} className="field w-64" />
          </Row>
        )}
      </Section>

      <Section title="Data">
        <Row label="Export" hint="One JSON file with pipelines, videos, rules, history and settings.">
          <span className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <input type="checkbox" checked={includeKeys} onChange={(e) => setIncludeKeys(e.target.checked)} className="accent-accent" />
              include API keys
            </label>
            <button onClick={doExport} className="btn ghost rounded-lg px-3 py-1.5 text-[13px]">Export JSON</button>
          </span>
        </Row>
        <Row label="Import" hint="Merge skips videos already here and matches pipelines by name. Replace deletes everything first.">
          <span className="flex gap-2">
            <button onClick={() => pickImport('merge')} className="btn ghost rounded-lg px-3 py-1.5 text-[13px]">Merge from file</button>
            <button onClick={() => pickImport('replace')} className="btn ghost rounded-lg px-3 py-1.5 text-[13px]">Replace from file</button>
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
          </span>
        </Row>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-medium tracking-[.06em] text-faint uppercase">{title}</h2>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {hint && <div className="text-[12.5px] text-faint">{hint}</div>}
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6">
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-[12.5px] text-faint">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 flex-none accent-accent" />
    </label>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="field text-sm">
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
