import type { JSX } from 'preact';
import { CIV_BY_ID } from '../data/index.ts';

/**
 * Civilization emblems (M9.8), drawn in code as SVG (AI-generated art is blocked — KI-2): a roundel in the colours
 * of the civ's architecture set with a motif from its world — the Eye of Horus, the ziggurat, Ishtar's star, the
 * Corinthian helmet, the double axe, the ding cauldron, the eagle… All original drawings; no historical artefact
 * is reproduced.
 */
interface Palette {
  bg: string;
  ring: string;
  fg: string;
  accent: string;
}
const PALETTES: Record<string, Palette> = {
  egyptian: { bg: '#1e3a6a', ring: '#d8b048', fg: '#f0dca0', accent: '#c0402c' },
  babylonian: { bg: '#22488c', ring: '#e8c048', fg: '#f4e6b0', accent: '#e07830' },
  greek: { bg: '#1c1712', ring: '#c8703c', fg: '#e08a52', accent: '#f0e2c0' },
  asian: { bg: '#7a1c18', ring: '#e0b848', fg: '#f2e2c0', accent: '#d83a2a' },
  roman: { bg: '#5e1212', ring: '#e0b848', fg: '#f0c860', accent: '#f2e8d0' },
};

type Motif = (p: Palette) => JSX.Element;

const star = (n: number, r0: number, r1: number, cx = 32, cy = 32, rot = -Math.PI / 2): string =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 ? r1 : r0;
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');

const MOTIFS: Record<string, Motif> = {
  egyptian: (p) => (
    <g stroke={p.fg} stroke-width="3" stroke-linecap="round" fill="none">
      <path d="M13 30 Q32 16 51 30 Q32 40 13 30 Z" fill={p.fg} stroke="none" />
      <circle cx="32" cy="29.5" r="5.5" fill={p.bg} stroke="none" />
      <path d="M13 21 Q32 11 51 21" />
      <path d="M27 36 L24 49" />
      <path d="M36 36 Q39 47 47 45" />
    </g>
  ),
  assyrian: (p) => (
    <g fill={p.fg}>
      <circle cx="32" cy="28" r="7" />
      <circle cx="32" cy="28" r="3.5" fill={p.accent} />
      <path d="M24 28 L6 22 L9 27 L5 30 L9 33 L7 37 L24 32 Z" />
      <path d="M40 28 L58 22 L55 27 L59 30 L55 33 L57 37 L40 32 Z" />
      <path d="M28 35 L32 50 L36 35 Z" />
    </g>
  ),
  sumerian: (p) => (
    <g fill={p.fg}>
      <rect x="12" y="42" width="40" height="7" />
      <rect x="18" y="35" width="28" height="7" />
      <rect x="24" y="28" width="16" height="7" />
      <rect x="28" y="20" width="8" height="8" fill={p.accent} />
      <rect x="30.5" y="28" width="3" height="21" fill={p.bg} />
    </g>
  ),
  babylonian: (p) => (
    <g>
      <polygon points={star(8, 21, 8)} fill={p.fg} />
      <circle cx="32" cy="32" r="5" fill={p.accent} />
    </g>
  ),
  hittite: (p) => (
    <g fill="none" stroke={p.fg} stroke-width="3">
      <circle cx="32" cy="34" r="14" />
      <path d="M22 28 H42 M20 36 H44 M27 21 V47 M37 21 V47" stroke-width="2" />
      <path d="M22 22 Q18 12 24 9 M42 22 Q46 12 40 9" stroke-linecap="round" />
      <circle cx="32" cy="14" r="3" fill={p.fg} />
    </g>
  ),
  persian: (p) => (
    <g>
      <rect x="20" y="44" width="24" height="6" fill={p.fg} />
      <rect x="25" y="34" width="14" height="10" fill={p.fg} />
      <rect x="20" y="29" width="24" height="5" fill={p.fg} />
      <path d="M32 8 Q43 18 36 28 Q38 21 33 16 Q29 22 31 28 Q22 19 32 8 Z" fill={p.accent} />
    </g>
  ),
  greek: (p) => (
    <g>
      <path d="M19 16 Q32 2 47 15" stroke={p.accent} stroke-width="5" fill="none" stroke-linecap="round" />
      <path d="M20 48 L20 27 Q20 13 32 13 Q44 13 44 27 L44 48 L37 48 L37 36 L34 33 L34 48 L30 48 L30 33 L27 36 L27 48 Z" fill={p.fg} />
      <path d="M25 26 H39 M32 26 V33" stroke={p.bg} stroke-width="3" />
    </g>
  ),
  minoan: (p) => (
    <g fill={p.fg}>
      <rect x="30.5" y="8" width="3" height="48" rx="1" />
      <path d="M30 18 L14 10 Q9 23 14 36 L30 28 Z" />
      <path d="M34 18 L50 10 Q55 23 50 36 L34 28 Z" />
    </g>
  ),
  phoenician: (p) => (
    <g>
      <path d="M8 38 L56 38 L49 47 L15 47 Z" fill={p.fg} />
      <path d="M8 38 Q4 30 10 27" stroke={p.fg} stroke-width="3" fill="none" />
      <rect x="31" y="12" width="2.5" height="26" fill={p.fg} />
      <path d="M19 15 L45 15 L43 34 L21 34 Z" fill="#8a3a8a" />
      <path d="M12 52 Q20 49 28 52 T44 52 T58 52" stroke={p.fg} stroke-width="2" fill="none" />
    </g>
  ),
  shang: (p) => (
    <g fill={p.fg}>
      <rect x="19" y="15" width="5" height="10" />
      <rect x="40" y="15" width="5" height="10" />
      <path d="M14 25 L50 25 L46 42 L18 42 Z" />
      <path d="M22 31 H42" stroke={p.bg} stroke-width="2.5" />
      <rect x="20" y="42" width="4" height="11" />
      <rect x="30" y="42" width="4" height="11" />
      <rect x="40" y="42" width="4" height="11" />
    </g>
  ),
  yamato: (p) => (
    <g>
      <circle cx="32" cy="23" r="11" fill={p.accent} stroke={p.fg} stroke-width="1.5" />
      <path d="M8 30 Q32 25 56 30 L56 35 Q32 30 8 35 Z" fill={p.fg} />
      <rect x="15" y="39" width="34" height="3.5" fill={p.fg} />
      <rect x="19" y="33" width="4.5" height="21" fill={p.fg} />
      <rect x="40.5" y="33" width="4.5" height="21" fill={p.fg} />
    </g>
  ),
  choson: (p) => (
    <g>
      <circle cx="32" cy="19" r="8" fill={p.accent} stroke={p.fg} stroke-width="1.5" />
      <polygon points="8,52 17,32 24,43 32,25 40,43 47,32 56,52" fill={p.fg} />
      <path d="M8 52 H56" stroke={p.fg} stroke-width="2" />
    </g>
  ),
  roman: (p) => (
    <g>
      <path d="M32 13 L36 21 L54 16 L45 29 L38 29 L37 43 L32 48 L27 43 L26 29 L19 29 L10 16 L28 21 Z" fill={p.fg} />
      <circle cx="32" cy="12" r="4" fill={p.fg} />
      <path d="M14 42 Q18 54 30 55 M50 42 Q46 54 34 55" stroke={p.fg} stroke-width="2.5" fill="none" />
    </g>
  ),
  carthaginian: (p) => (
    <g fill={p.fg}>
      <circle cx="32" cy="16" r="7" />
      <path d="M14 22 L18 26 L46 26 L50 22 L50 28 L14 28 Z" />
      <path d="M32 28 L19 53 L45 53 Z" />
    </g>
  ),
  macedonian: (p) => (
    <g>
      <polygon points={star(16, 23, 7)} fill={p.fg} />
      <circle cx="32" cy="32" r="6" fill={p.bg} stroke={p.fg} stroke-width="2" />
    </g>
  ),
  palmyran: (p) => (
    <g fill={p.fg}>
      <rect x="12" y="50" width="40" height="4" />
      <rect x="16" y="24" width="5" height="26" />
      <rect x="43" y="24" width="5" height="26" />
      <path d="M14 24 Q32 5 50 24 L44 24 Q32 12 20 24 Z" />
      <circle cx="32" cy="36" r="4" fill={p.accent} />
    </g>
  ),
};

/** The emblem of `civ` as a `size`-px roundel. */
export function Emblem({ civ, size, class: cls }: { civ: string; size: number; class?: string }) {
  const def = CIV_BY_ID.get(civ);
  const p = PALETTES[def?.arch ?? 'greek']!;
  const motif = MOTIFS[civ];
  return (
    <svg class={cls ?? 'emblem'} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${def?.name ?? civ} emblem`} data-testid={`emblem-${civ}`}>
      <circle cx="32" cy="32" r="31" fill={p.ring} />
      <circle cx="32" cy="32" r="28" fill={p.bg} />
      <circle cx="32" cy="32" r="26" fill="none" stroke={p.ring} stroke-width="0.8" opacity="0.6" />
      {motif ? motif(p) : <text x="32" y="40" text-anchor="middle" font-size="22" fill={p.fg}>{(def?.name ?? civ).slice(0, 1)}</text>}
    </svg>
  );
}
