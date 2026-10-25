import type { Pipeline } from '@/lib/types';

export function PipelineDot({ pipeline, size = 9 }: { pipeline: Pipeline; size?: number }) {
  if (pipeline.isInbox) return null;
  return <span className="inline-block flex-none rounded-[3px]" style={{ width: size, height: size, background: pipeline.color ?? '#9AA8FF' }} />;
}
