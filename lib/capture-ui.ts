// In-page capture panel: a centered card with Undo and "move to" chips, isolated in a shadow root.
import type { Pipeline } from './types';

let host: HTMLElement | null = null;
let timer: number | undefined;

const CSS = `
:host{all:initial}
.p{position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:2147483647;width:460px;max-width:calc(100vw - 32px);box-sizing:border-box;
padding:14px;border-radius:14px;background:#1E2026;border:1px solid #30323A;box-shadow:0 24px 60px rgba(0,0,0,.55);
color:#ECEDF1;font:14px/1.5 Geist,ui-sans-serif,system-ui,sans-serif;animation:in .3s cubic-bezier(.2,.8,.2,1) both}
.p.out{animation:out .18s ease-in both}
.top{display:flex;align-items:center;gap:12px}
img{flex:none;width:72px;height:40px;border-radius:7px;object-fit:cover;background:#26282E}
.b{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}
.h{font-weight:600;font-size:15px}.s{font-size:12.5px;color:#A3A6B1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
button{border:1px solid #30323A;background:#24262C;color:#ECEDF1;font:inherit;font-size:13px;font-weight:500;cursor:pointer;border-radius:8px;padding:6px 11px}
button:hover{background:#2A2C33}
.x{flex:none;width:30px;height:30px;padding:0;color:#A3A6B1;font-size:16px;line-height:1}
.row{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;align-items:center}
.lbl{font-size:12px;color:#8C8F9B;margin-right:4px}
.chip{display:flex;align-items:center;gap:7px;padding:5px 10px;border-radius:999px;font-size:12.5px}
.chip.on{background:rgba(154,168,255,.16);border-color:rgba(154,168,255,.4)}
.dot{width:8px;height:8px;border-radius:3px;background:var(--c)}
.bar{position:absolute;left:14px;right:14px;bottom:0;height:2px;border-radius:2px;background:#9AA8FF;transform-origin:left;animation:shrink var(--t) linear both}
.p:hover .bar{animation-play-state:paused}
@keyframes in{from{opacity:0;transform:translate(-50%,-10px) scale(.98)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes out{to{opacity:0;transform:translate(-50%,-8px)}}
@keyframes shrink{to{transform:scaleX(0)}}
@media (prefers-reduced-motion:reduce){.p,.p.out{animation:none}}`;

export function showCapturePanel(o: {
  title: string;
  subtitle: string;
  thumb?: string;
  pipelines: Pipeline[];
  currentId: string;
  onMove: (pipelineId: string) => Promise<void> | void;
  onUndo?: () => void;
  ms?: number;
}) {
  dismiss();
  const ms = o.ms ?? 7000;
  host = document.createElement('div');
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const panel = el('div', 'p');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', o.title);
  panel.style.setProperty('--t', `${ms}ms`);

  const top = el('div', 'top');
  const img = document.createElement('img');
  img.alt = '';
  if (o.thumb) img.src = o.thumb;
  const body = el('div', 'b');
  const h = el('span', 'h', o.title);
  const s = el('span', 's', o.subtitle);
  body.append(h, s);
  top.append(img, body);
  if (o.onUndo) {
    const undo = el('button', '', 'Undo');
    undo.onclick = () => {
      o.onUndo!();
      dismiss();
    };
    top.append(undo);
  }
  const x = el('button', 'x', '×');
  x.setAttribute('aria-label', 'Close');
  x.onclick = dismiss;
  top.append(x);
  panel.append(top);

  const row = el('div', 'row');
  row.append(el('span', 'lbl', 'Move to'));
  let currentId = o.currentId;
  for (const p of o.pipelines) {
    const chip = el('button', 'chip' + (p.id === currentId ? ' on' : ''));
    if (!p.isInbox) {
      const dot = el('span', 'dot');
      dot.style.setProperty('--c', p.color ?? '#9AA8FF');
      chip.append(dot);
    }
    chip.append(document.createTextNode(p.name));
    chip.onclick = async () => {
      if (p.id === currentId) return;
      await o.onMove(p.id);
      currentId = p.id;
      row.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
      chip.classList.add('on');
      h.textContent = `Moved to ${p.name}`;
      arm();
    };
    row.append(chip);
  }
  panel.append(row);
  const bar = el('div', 'bar');
  panel.append(bar);
  root.append(style, panel);
  (document.body ?? document.documentElement).append(host);

  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
  document.addEventListener('keydown', onKey, true);
  const cleanup = () => document.removeEventListener('keydown', onKey, true);

  let hovering = false;
  panel.onmouseenter = () => (hovering = true);
  panel.onmouseleave = () => {
    hovering = false;
    arm();
  };
  function arm() {
    window.clearTimeout(timer);
    bar.style.animation = 'none';
    void bar.offsetWidth; // restart the progress bar
    bar.style.animation = '';
    timer = window.setTimeout(() => {
      if (hovering) return arm();
      panel.classList.add('out');
      window.setTimeout(() => {
        cleanup();
        dismiss();
      }, 180);
    }, ms);
  }
  arm();
}

function el(tag: string, cls: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function dismiss() {
  window.clearTimeout(timer);
  host?.remove();
  host = null;
}
