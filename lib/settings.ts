import { useEffect, useState } from 'react';
import { storage } from 'wxt/utils/storage';
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  intercept: true,
  interceptLeftClick: false,
  watchedThreshold: 0.9,
  shortcuts: { watch: 'w', keep: 'k', move: 'm', drop: 'd', undo: 'z' },
  badgeScope: 'all',
  theme: 'dark',
  reminders: { scheduled: { enabled: false, times: ['18:00'], days: [1, 2, 3, 4, 5] }, threshold: { enabled: true } },
  ai: { provider: 'anthropic', model: '', apiKey: '', ollamaUrl: 'http://localhost:11434' },
};

export const settings = storage.defineItem<Settings>('local:settings', { fallback: DEFAULT_SETTINGS });

/** Older saved settings lack newer keys; fill them from defaults. */
export async function loadSettings(): Promise<Settings> {
  const s = await settings.getValue();
  return { ...DEFAULT_SETTINGS, ...s, shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...s.shortcuts }, reminders: { ...DEFAULT_SETTINGS.reminders, ...s.reminders }, ai: { ...DEFAULT_SETTINGS.ai, ...s.ai } };
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => Promise<void>] {
  const [value, setValue] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    void loadSettings().then(setValue);
    return settings.watch((v) => v && setValue(v));
  }, []);
  const update = async (patch: Partial<Settings>) => {
    const next = { ...(await loadSettings()), ...patch };
    setValue(next);
    await settings.setValue(next);
  };
  return [value, update];
}

export function applyTheme(theme: Settings['theme']) {
  const dark = theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** Keeps <html data-theme> in sync with settings and the OS preference. */
export function useTheme() {
  const [s] = useSettings();
  useEffect(() => {
    applyTheme(s.theme);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme(s.theme);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [s.theme]);
}
