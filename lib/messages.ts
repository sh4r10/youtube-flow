import { browser } from 'wxt/browser';
import type { CaptureMethod, Item, Pipeline } from './types';

export type ItemMeta = Partial<Pick<Item, 'title' | 'channel' | 'durationSec' | 'thumbnailUrl'>>;

export type CaptureResult =
  | { kind: 'added'; item: Item; pipeline: Pipeline; viaRule: boolean; pipelines: Pipeline[] }
  | { kind: 'duplicate'; item: Item; pipeline: Pipeline; pipelines: Pipeline[] }
  | { kind: 'ignored'; reason: string };

export type Msg =
  | { type: 'capture'; url: string; method: CaptureMethod; pipelineId?: string; meta?: ItemMeta }
  | { type: 'undoCapture'; itemId: string }
  | { type: 'moveItem'; itemId: string; pipelineId: string }
  | { type: 'queueTab' }
  | { type: 'sweep' }
  | { type: 'countYouTubeTabs' }
  | { type: 'watched'; videoId: string }
  | { type: 'openApp'; hash?: string }
  | { type: 'pageMeta' };

export type Reply<M extends Msg> = M extends { type: 'capture' }
  ? CaptureResult
  : M extends { type: 'queueTab' }
    ? CaptureResult
    : M extends { type: 'sweep' }
      ? { added: number; skipped: number }
      : M extends { type: 'countYouTubeTabs' }
        ? number
        : M extends { type: 'pageMeta' }
          ? ItemMeta
          : void;

export function send<M extends Msg>(msg: M): Promise<Reply<M>> {
  return browser.runtime.sendMessage(msg) as Promise<Reply<M>>;
}
