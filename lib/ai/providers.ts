import type { AiProvider } from '../types';

export const PROVIDERS: Record<AiProvider, { label: string; defaultModel: string; needsKey: boolean }> = {
  anthropic: { label: 'Claude', defaultModel: 'claude-opus-5-5', needsKey: true },
  openai: { label: 'OpenAI', defaultModel: 'gpt-5', needsKey: true },
  deepseek: { label: 'DeepSeek', defaultModel: 'deepseek-chat', needsKey: true },
  ollama: { label: 'Ollama', defaultModel: 'llama3.1', needsKey: false },
};
