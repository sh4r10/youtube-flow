import { useEffect, useState } from 'react';
import { INBOX_ID } from './db';

export type View = 'process' | 'pipelines' | 'rules' | 'archive' | 'stats' | 'settings';
export const VIEWS: { view: View; label: string }[] = [
  { view: 'process', label: 'Process' },
  { view: 'pipelines', label: 'Pipelines' },
  { view: 'rules', label: 'Rules' },
  { view: 'archive', label: 'Archive' },
  { view: 'stats', label: 'Stats' },
  { view: 'settings', label: 'Settings' },
];

export interface Route {
  view: View;
  pipelineId: string;
  itemId?: string;
}

export function parseHash(hash: string): Route {
  const [path, qs] = hash.replace(/^#\/?/, '').split('?');
  const [view, id] = path.split('/');
  const known = VIEWS.find((v) => v.view === view)?.view ?? 'process';
  return { view: known, pipelineId: id || INBOX_ID, itemId: new URLSearchParams(qs).get('item') ?? undefined };
}

export const toHash = (r: Route) => `#/${r.view}/${r.pipelineId}${r.itemId ? `?item=${r.itemId}` : ''}`;
export const go = (r: Route) => (location.hash = toHash(r));

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}
