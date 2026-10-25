export type ItemStatus = 'queued' | 'watching' | 'watched' | 'dropped';
export type CaptureMethod = 'intercept' | 'menu' | 'button' | 'sweep' | 'import';

export interface Pipeline {
  id: string;
  name: string;
  order: number;
  isInbox: boolean;
  color?: string;
  thresholdWarn?: number;
}

export interface Summary {
  provider: string;
  tldr: string;
  points: string[];
  stamps: { t: string; label: string }[];
  verdict: string;
  why: string;
}

export interface Item {
  id: string;
  url: string;
  kind: 'youtube-video';
  videoId: string;
  title: string;
  channel: string;
  durationSec?: number;
  thumbnailUrl: string;
  pipelineId: string;
  status: ItemStatus;
  /** FIFO position inside the pipeline. Keep bumps it to Date.now(). */
  order: number;
  addedAt: number;
  captureMethod: CaptureMethod;
  decidedAt?: number;
  summary?: Summary;
}

export type RuleCondition =
  | { type: 'channel'; value: string }
  | { type: 'keyword'; value: string }
  | { type: 'duration'; minSec?: number; maxSec?: number };

export interface Rule {
  id: string;
  order: number;
  condition: RuleCondition;
  targetPipelineId: string;
  enabled: boolean;
}

export type EventAction = 'added' | 'kept' | 'moved' | 'watching' | 'watched' | 'dropped' | 'restored';

export interface PipelineEvent {
  id?: number;
  itemId: string;
  action: EventAction;
  at: number;
  fromPipelineId?: string;
  toPipelineId?: string;
}

export type AiProvider = 'anthropic' | 'openai' | 'deepseek' | 'ollama';

export interface Settings {
  intercept: boolean;
  interceptLeftClick: boolean;
  watchedThreshold: number;
  shortcuts: { watch: string; keep: string; move: string; drop: string; undo: string };
  badgeScope: 'inbox' | 'all';
  theme: 'dark' | 'light' | 'system';
  reminders: {
    /** Daily at these "HH:MM" times, on these weekdays (0 = Sunday). */
    scheduled: { enabled: boolean; times: string[]; days: number[] };
    threshold: { enabled: boolean };
  };
  ai: { provider: AiProvider; model: string; apiKey: string; ollamaUrl: string };
}

/** Versioned JSON backup. API keys are included only when the user opts in. */
export interface ExportFile {
  schemaVersion: 1;
  exportedAt: number;
  pipelines: Pipeline[];
  items: Item[];
  rules: Rule[];
  events: PipelineEvent[];
  settings?: Settings;
}
