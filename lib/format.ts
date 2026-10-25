export function age(addedAt: number, now = Date.now()): string {
  const d = Math.floor((now - addedAt) / 86_400_000);
  if (d < 1) return 'today';
  if (d === 1) return '1 day';
  if (d < 30) return `${d} days`;
  const m = Math.floor(d / 30);
  return m === 1 ? '1 month' : `${m} months`;
}

export const METHOD_LABEL = { intercept: 'middle-click', menu: 'menu', button: 'tab', sweep: 'sweep', import: 'import' } as const;
