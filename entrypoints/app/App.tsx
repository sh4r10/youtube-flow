import { useLiveQuery } from 'dexie-react-hooks';
import { Logo } from '@/components/Logo';
import { db, ensureInbox } from '@/lib/db';
import { useRoute, VIEWS } from '@/lib/route';
import { useTheme } from '@/lib/settings';
import { ArchiveView } from './ArchiveView';
import { PipelinesView } from './PipelinesView';
import { ProcessView } from './ProcessView';
import { RulesView } from './RulesView';
import { SettingsView } from './SettingsView';
import { StatsView } from './StatsView';

void ensureInbox();

export function App() {
  useTheme();
  const route = useRoute();
  const pipelines = useLiveQuery(() => db.pipelines.orderBy('order').toArray());
  if (!pipelines?.length) return null;
  const pipeline = pipelines.find((p) => p.id === route.pipelineId) ?? pipelines[0];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1240px] items-center gap-6 px-6 py-3">
          <span className="flex items-center gap-2.5 font-semibold">
            <Logo /> Flow
          </span>
          <nav aria-label="Main" className="flex gap-1">
            {VIEWS.map((v) => (
              <a
                key={v.view}
                href={`#/${v.view}/${pipeline.id}`}
                aria-current={route.view === v.view ? 'page' : undefined}
                className="rounded-lg px-3 py-1.5 text-muted hover:bg-hover aria-[current]:bg-raised aria-[current]:text-text"
              >
                {v.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] px-6 py-8">
        {route.view === 'process' && <ProcessView pipeline={pipeline} pipelines={pipelines} itemId={route.itemId} />}
        {route.view === 'pipelines' && <PipelinesView pipeline={pipeline} pipelines={pipelines} />}
        {route.view === 'rules' && <RulesView pipelines={pipelines} />}
        {route.view === 'archive' && <ArchiveView pipelines={pipelines} />}
        {route.view === 'stats' && <StatsView pipelines={pipelines} />}
        {route.view === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
