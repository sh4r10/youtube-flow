import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { PipelineDot } from '@/components/PipelineDot';
import { db, INBOX_ID, newId } from '@/lib/db';
import type { Pipeline, Rule, RuleCondition } from '@/lib/types';

const TYPE_LABEL: Record<RuleCondition['type'], string> = { channel: 'Channel is', keyword: 'Title contains', duration: 'Duration' };

function describe(c: RuleCondition): string {
  if (c.type === 'duration') {
    const min = c.minSec != null ? `${Math.round(c.minSec / 60)} min` : null;
    const max = c.maxSec != null ? `${Math.round(c.maxSec / 60)} min` : null;
    return min && max ? `Duration ${min} to ${max}` : min ? `Duration over ${min}` : max ? `Duration under ${max}` : 'Any duration';
  }
  return `${TYPE_LABEL[c.type]} “${c.value}”`;
}

export function RulesView({ pipelines }: { pipelines: Pipeline[] }) {
  const rules = useLiveQuery(() => db.rules.orderBy('order').toArray());
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const name = (id: string) => pipelines.find((p) => p.id === id);

  async function move(i: number, dir: -1 | 1) {
    if (!rules) return;
    const j = i + dir;
    if (j < 0 || j >= rules.length) return;
    await db.transaction('rw', db.rules, async () => {
      await db.rules.update(rules[i].id, { order: rules[j].order });
      await db.rules.update(rules[j].id, { order: rules[i].order });
    });
  }

  async function save(rule: Rule) {
    await db.rules.put(rule);
    setEditing(null);
  }

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Rules</h1>
          <p className="text-muted">New captures go to the first matching rule's pipeline, otherwise to the Inbox. Picking a pipeline in the right-click menu overrides rules.</p>
        </div>
        {editing === null && (
          <button onClick={() => setEditing('new')} className="btn primary flex-none rounded-[10px] px-3.5 py-2">
            Add rule
          </button>
        )}
      </div>

      {editing !== null && (
        <RuleForm
          rule={editing === 'new' ? null : editing}
          order={editing === 'new' ? (rules?.length ? rules[rules.length - 1].order + 1 : 0) : editing.order}
          pipelines={pipelines}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      <ol className="flex flex-col gap-1.5">
        {rules?.map((r, i) => {
          const target = name(r.targetPipelineId);
          return (
            <li key={r.id} className={`flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 ${r.enabled ? '' : 'opacity-60'}`}>
              <input type="checkbox" aria-label="Enabled" checked={r.enabled} onChange={(e) => db.rules.update(r.id, { enabled: e.target.checked })} className="size-4 accent-accent" />
              <span className="min-w-0 flex-1 truncate">
                {describe(r.condition)}
                <span className="text-faint"> → </span>
                {target ? (
                  <span className="inline-flex items-center gap-1.5">
                    <PipelineDot pipeline={target} size={8} /> {target.name}
                  </span>
                ) : (
                  <span className="text-warn-text">missing pipeline</span>
                )}
              </span>
              <div className="flex gap-1">
                <Small label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</Small>
                <Small label="Move down" disabled={i === rules.length - 1} onClick={() => move(i, 1)}>↓</Small>
                <Small label="Edit" onClick={() => setEditing(r)}>Edit</Small>
                <Small label="Delete" onClick={() => db.rules.delete(r.id)}>Delete</Small>
              </div>
            </li>
          );
        })}
      </ol>
      {rules && !rules.length && editing === null && <p className="text-faint">No rules yet. Everything lands in the Inbox.</p>}
    </div>
  );
}

function RuleForm({ rule, order, pipelines, onSave, onCancel }: { rule: Rule | null; order: number; pipelines: Pipeline[]; onSave: (r: Rule) => void; onCancel: () => void }) {
  const [type, setType] = useState<RuleCondition['type']>(rule?.condition.type ?? 'channel');
  const c = rule?.condition;
  return (
    <form
      className="rise flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const min = Number(f.get('min'));
        const max = Number(f.get('max'));
        const value = f.get('value')?.toString().trim() ?? '';
        const condition: RuleCondition =
          type === 'duration' ? { type, minSec: min > 0 ? min * 60 : undefined, maxSec: max > 0 ? max * 60 : undefined } : { type, value };
        if (type !== 'duration' && !value) return;
        if (type === 'duration' && !(min > 0 || max > 0)) return;
        onSave({ id: rule?.id ?? newId(), order, enabled: rule?.enabled ?? true, condition, targetPipelineId: f.get('target')!.toString() });
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-faint">
        Condition
        <select value={type} onChange={(e) => setType(e.target.value as RuleCondition['type'])} className="field text-sm text-text">
          {(Object.keys(TYPE_LABEL) as RuleCondition['type'][]).map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
      </label>
      {type === 'duration' ? (
        <>
          <label className="flex flex-col gap-1 text-xs text-faint">
            From (min)
            <input name="min" type="number" min={0} defaultValue={c?.type === 'duration' && c.minSec ? c.minSec / 60 : ''} className="field w-24 text-sm text-text" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-faint">
            To (min)
            <input name="max" type="number" min={0} defaultValue={c?.type === 'duration' && c.maxSec ? c.maxSec / 60 : ''} className="field w-24 text-sm text-text" />
          </label>
        </>
      ) : (
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-faint">
          {type === 'channel' ? 'Channel name' : 'Keyword'}
          <input name="value" autoFocus required defaultValue={c && c.type !== 'duration' ? c.value : ''} className="field text-sm text-text" />
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-faint">
        Send to
        <select name="target" defaultValue={rule?.targetPipelineId ?? pipelines.find((p) => !p.isInbox)?.id ?? INBOX_ID} className="field text-sm text-text">
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <button className="btn primary rounded-lg px-3.5 py-1.5">{rule ? 'Save' : 'Add'}</button>
      <button type="button" onClick={onCancel} className="btn ghost rounded-lg px-3 py-1.5">Cancel</button>
    </form>
  );
}

function Small({ label, children, ...rest }: { label: string; children: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} aria-label={label} title={label} className="btn ghost rounded-lg px-2.5 py-1 text-[13px]">
      {children}
    </button>
  );
}
