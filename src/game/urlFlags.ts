/**
 * Display and test flags that survive the page reloads the menus use to start or load a game (edge scrolling
 * off, placeholder art, no fog, start paused).
 */
const FLAGS = ['edgeScroll', 'art', 'fog', 'paused'] as const;

export function withFlags(query: string, from: URLSearchParams): string {
  const q = new URLSearchParams(query.replace(/^\?/, ''));
  for (const k of FLAGS) if (from.has(k)) q.set(k, from.get(k)!);
  return `?${q}`;
}
