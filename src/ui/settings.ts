import { effect, signal } from '@preact/signals';

/**
 * Game settings (M12.2), kept in localStorage (`empires.settings`) and applied live: camera scrolling, the speed a
 * new skirmish starts at, the hotkey layout, and the modern conveniences — each can be switched off, and the
 * one-click **Classic** preset switches them all off for the original's feel (PLAN: "Modern QoL is on by default,
 * and a one-click 'Classic' preset turns it off").
 */
export interface Qol {
  /** Right-click with a building selected sets where its units gather (the original had none). */
  rally: boolean;
  /** The idle-villager button by the minimap (the "." key stays: RoR 1.0a had it). */
  idleButton: boolean;
  /** A + click: move and fight whatever is met on the way. */
  attackMove: boolean;
  /** Shift + right-click adds an order to the queue (Shift-placing several buildings stays: the original's). */
  shiftQueue: boolean;
  /** Mouse-wheel zoom (the original had one fixed scale). */
  zoom: boolean;
  /** Population always in the top bar (the original showed it only on F11). */
  popCounter: boolean;
  /** A grid of every selected unit (the original's status box shows one at a time; Tab cycles). */
  selectionGrid: boolean;
}

export type HotkeyLayout = 'classic' | 'grid';

export interface GameSettings {
  /** Screen scrolling, logical px per second at zoom 1. */
  scrollSpeed: number;
  edgeScroll: boolean;
  /** The speed a new skirmish starts at (1.0 Normal, 1.5 Fast, 2.0 Very Fast — research §5). */
  defaultSpeed: number;
  hotkeys: HotkeyLayout;
  qol: Qol;
}

export const QOL_LABELS: [keyof Qol, string][] = [
  ['rally', 'Rally points'],
  ['idleButton', 'Idle-villager button'],
  ['attackMove', 'Attack-move'],
  ['shiftQueue', 'Shift-queued orders'],
  ['zoom', 'Zoom'],
  ['popCounter', 'Population in the top bar'],
  ['selectionGrid', 'Selection grid'],
];

export const MODERN_QOL: Qol = { rally: true, idleButton: true, attackMove: true, shiftQueue: true, zoom: true, popCounter: true, selectionGrid: true };
export const CLASSIC_QOL: Qol = { rally: false, idleButton: false, attackMove: false, shiftQueue: false, zoom: false, popCounter: false, selectionGrid: false };
export const SPEEDS = [1, 1.5, 2] as const;
export const SCROLL_MIN = 300;
export const SCROLL_MAX = 1800;
export const DEFAULT_SETTINGS: GameSettings = { scrollSpeed: 900, edgeScroll: true, defaultSpeed: 1, hotkeys: 'classic', qol: { ...MODERN_QOL } };
const KEY = 'empires.settings';

/** Settings from untrusted JSON: anything missing or out of range falls back to its default. */
export function parseSettings(raw: unknown): GameSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof GameSettings, unknown>>;
  const q = (v.qol && typeof v.qol === 'object' ? v.qol : {}) as Partial<Record<keyof Qol, unknown>>;
  const qol = { ...MODERN_QOL };
  for (const [k] of QOL_LABELS) if (typeof q[k] === 'boolean') qol[k] = q[k];
  const scroll = typeof v.scrollSpeed === 'number' && v.scrollSpeed >= SCROLL_MIN && v.scrollSpeed <= SCROLL_MAX ? v.scrollSpeed : DEFAULT_SETTINGS.scrollSpeed;
  return {
    scrollSpeed: scroll,
    edgeScroll: typeof v.edgeScroll === 'boolean' ? v.edgeScroll : DEFAULT_SETTINGS.edgeScroll,
    defaultSpeed: SPEEDS.includes(v.defaultSpeed as 1) ? (v.defaultSpeed as number) : DEFAULT_SETTINGS.defaultSpeed,
    hotkeys: v.hotkeys === 'grid' ? 'grid' : 'classic',
    qol,
  };
}

function load(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return parseSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return parseSettings(null); // storage blocked or corrupt: defaults
  }
}

export const gameSettings = signal<GameSettings>(load());

effect(() => {
  const v = gameSettings.value;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* private mode: the choice lasts this session */
  }
});

export function setSettings(patch: Partial<Omit<GameSettings, 'qol'>> & { qol?: Partial<Qol> }): void {
  const cur = gameSettings.value;
  gameSettings.value = { ...cur, ...patch, qol: { ...cur.qol, ...patch.qol } };
}

/** Which preset the conveniences match, if any. */
export function qolPreset(q: Qol): 'modern' | 'classic' | 'custom' {
  const vals = QOL_LABELS.map(([k]) => q[k]);
  return vals.every(Boolean) ? 'modern' : vals.every((x) => !x) ? 'classic' : 'custom';
}

/** Grid layout: a button's key is its place in the 5 × 3 command grid, row by row. */
export const GRID_KEYS = ['Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F', 'G', 'Z', 'X', 'C', 'V', 'B'] as const;

/** Re-letter the command buttons for a layout (Classic keeps the original's letters; Escape stays Escape). */
export function applyHotkeys<T extends { hotkey: string }>(buttons: T[], layout: HotkeyLayout): T[] {
  if (layout === 'classic') return buttons;
  return buttons.map((b, i) => (b.hotkey === 'Escape' ? b : { ...b, hotkey: GRID_KEYS[i] ?? '' }));
}
