import { Graphics, Rectangle, Texture, type Renderer } from 'pixi.js';
import type { UnitClass } from '../data/types.ts';
import { HALF_H, HALF_W } from './iso.ts';

/**
 * Placeholder art (until the M3 baker lands): simple shapes drawn once into shared textures, split exactly like
 * the baked art will be — a base texture plus a white "team" texture tinted with the player color (DECISIONS D6).
 * Every texture carries its anchor (the ground point it stands on).
 */
export interface SpriteArt {
  base: Texture;
  team: Texture | null;
  anchorX: number;
  anchorY: number;
}

const RES = 2;

function bake(renderer: Renderer, draw: (g: Graphics) => void, drawTeam?: (g: Graphics) => void): SpriteArt {
  const g = new Graphics();
  draw(g);
  const t = drawTeam ? new Graphics() : null;
  if (t && drawTeam) drawTeam(t);
  // A shared frame so base and team textures line up exactly.
  const b = g.getLocalBounds();
  let x0 = b.minX;
  let y0 = b.minY;
  let x1 = b.maxX;
  let y1 = b.maxY;
  if (t) {
    const tb = t.getLocalBounds();
    x0 = Math.min(x0, tb.minX);
    y0 = Math.min(y0, tb.minY);
    x1 = Math.max(x1, tb.maxX);
    y1 = Math.max(y1, tb.maxY);
  }
  x0 = Math.floor(x0) - 1;
  y0 = Math.floor(y0) - 1;
  x1 = Math.ceil(x1) + 1;
  y1 = Math.ceil(y1) + 1;
  const frame = new Rectangle(x0, y0, x1 - x0, y1 - y0);
  const base = renderer.generateTexture({ target: g, frame, resolution: RES, antialias: true });
  const team = t ? renderer.generateTexture({ target: t, frame, resolution: RES, antialias: true }) : null;
  g.destroy();
  t?.destroy();
  return { base, team, anchorX: -x0 / frame.width, anchorY: -y0 / frame.height };
}

const SKIN = 0xd9a67a;
const SHADOW = { color: 0x000000, alpha: 0.28 };

const CLASS_STYLE: Record<UnitClass, { body: number; h: number; w: number; mount?: 'horse' | 'elephant' | 'chariot' | 'ship' | 'siege' }> = {
  villager: { body: 0xb08a5a, h: 22, w: 9 },
  infantry: { body: 0x8a5a36, h: 24, w: 10 },
  slinger: { body: 0xa89060, h: 22, w: 9 },
  footArcher: { body: 0x5f7a3a, h: 23, w: 9 },
  mountedArcher: { body: 0x5f7a3a, h: 22, w: 9, mount: 'horse' },
  scout: { body: 0x7a6040, h: 22, w: 9, mount: 'horse' },
  cavalry: { body: 0x9a9a9a, h: 24, w: 10, mount: 'horse' },
  camel: { body: 0xb49a6a, h: 24, w: 10, mount: 'horse' },
  chariot: { body: 0x8a6a3a, h: 22, w: 9, mount: 'chariot' },
  elephant: { body: 0x8a8a8a, h: 26, w: 10, mount: 'elephant' },
  hoplite: { body: 0xc08a3a, h: 26, w: 11 },
  priest: { body: 0xf0ead8, h: 24, w: 10 },
  siege: { body: 0x7a5a36, h: 18, w: 16, mount: 'siege' },
  fishingShip: { body: 0x8a6a40, h: 16, w: 22, mount: 'ship' },
  tradeShip: { body: 0x8a6a40, h: 18, w: 26, mount: 'ship' },
  transport: { body: 0x8a6a40, h: 18, w: 26, mount: 'ship' },
  warship: { body: 0x6a4a2a, h: 20, w: 28, mount: 'ship' },
  animal: { body: 0xc8a064, h: 10, w: 14, mount: 'horse' },
};

export function unitArt(renderer: Renderer, cls: UnitClass, radius: number): SpriteArt {
  const st = CLASS_STYLE[cls];
  const scale = Math.max(1, radius / 0.2) ** 0.6;
  const s = (v: number): number => v * scale;
  return bake(
    renderer,
    (g) => {
      g.ellipse(0, 0, s(st.w * 0.9), s(st.w * 0.45)).fill(SHADOW);
      if (st.mount === 'horse') {
        g.ellipse(0, -s(7), s(11), s(5)).fill(cls === 'animal' ? st.body : 0x6b4a2e);
        g.rect(-s(9), -s(6), s(2.5), s(6)).fill(0x4a3220);
        g.rect(s(6.5), -s(6), s(2.5), s(6)).fill(0x4a3220);
        g.ellipse(s(11), -s(10), s(3.5), s(3)).fill(cls === 'animal' ? st.body : 0x6b4a2e);
        if (cls === 'animal') return;
        g.roundRect(-s(4), -s(22), s(8), s(12), s(3)).fill(st.body);
        g.circle(0, -s(25), s(3.5)).fill(SKIN);
      } else if (st.mount === 'elephant') {
        g.ellipse(0, -s(12), s(16), s(10)).fill(0x7c7c80);
        g.rect(-s(12), -s(6), s(5), s(6)).fill(0x66666a);
        g.rect(s(7), -s(6), s(5), s(6)).fill(0x66666a);
        g.ellipse(s(15), -s(14), s(6), s(6)).fill(0x7c7c80);
        g.rect(s(17), -s(12), s(3), s(10)).fill(0x6e6e72);
        g.roundRect(-s(4), -s(30), s(8), s(10), s(3)).fill(st.body);
        g.circle(0, -s(33), s(3.5)).fill(SKIN);
      } else if (st.mount === 'chariot') {
        g.rect(-s(8), -s(10), s(12), s(8)).fill(0x8a6a3a);
        g.circle(-s(2), -s(2), s(4)).stroke({ width: s(1.5), color: 0x3a2a1a });
        g.ellipse(s(12), -s(8), s(7), s(4)).fill(0x6b4a2e);
        g.roundRect(-s(4), -s(22), s(7), s(12), s(3)).fill(st.body);
        g.circle(-s(0.5), -s(25), s(3.5)).fill(SKIN);
      } else if (st.mount === 'siege') {
        g.rect(-s(10), -s(8), s(20), s(6)).fill(0x6a4a2a);
        g.circle(-s(7), -s(2), s(3)).fill(0x3a2a1a);
        g.circle(s(7), -s(2), s(3)).fill(0x3a2a1a);
        g.moveTo(-s(6), -s(8)).lineTo(s(6), -s(22)).stroke({ width: s(2.5), color: 0x8a6a40 });
      } else if (st.mount === 'ship') {
        g.moveTo(-s(st.w / 2), -s(6)).lineTo(s(st.w / 2), -s(6)).lineTo(s(st.w / 2 - 4), 0).lineTo(-s(st.w / 2 - 4), 0).closePath().fill(st.body);
        g.rect(-s(1), -s(26), s(2), s(20)).fill(0x5a4020);
        g.moveTo(s(1), -s(24)).lineTo(s(11), -s(12)).lineTo(s(1), -s(10)).closePath().fill(0xe8e0c8);
      } else {
        g.roundRect(-s(st.w / 2), -s(st.h - 6), s(st.w), s(st.h - 8), s(3)).fill(st.body);
        g.rect(-s(st.w / 2 - 1), -s(3), s(3), s(3)).fill(0x4a3220);
        g.rect(s(st.w / 2 - 4), -s(3), s(3), s(3)).fill(0x4a3220);
        g.circle(0, -s(st.h - 3), s(3.8)).fill(SKIN);
        if (cls === 'hoplite') g.circle(-s(6), -s(12), s(5)).fill(0xb87a2a);
        if (cls === 'footArcher') g.arc(s(6), -s(12), s(7), -1.2, 1.2).stroke({ width: s(1.2), color: 0x4a3220 });
      }
    },
    cls === 'animal'
      ? undefined
      : (t) => {
          const y = st.mount === 'elephant' ? -s(26) : st.mount === 'horse' || st.mount === 'chariot' ? -s(18) : -s(st.h - 9);
          if (st.mount === 'ship') t.rect(s(1), -s(24), s(9), s(4)).fill(0xffffff);
          else if (st.mount === 'siege') t.rect(-s(10), -s(9), s(20), s(2.5)).fill(0xffffff);
          else t.rect(-s(st.w / 2), y, s(st.w), s(4)).fill(0xffffff);
        },
  );
}

/** Iso box on a footprint of `size` tiles, `h` px tall, with a team-colored band under the roof. */
export function buildingArt(renderer: Renderer, size: number, h: number, wall: number, roof: number): SpriteArt {
  const hw = size * HALF_W;
  const hh = size * HALF_H;
  return bake(
    renderer,
    (g) => {
      g.poly([-hw, 0, 0, hh, hw, 0, 0, -hh]).fill({ color: 0x000000, alpha: 0.18 });
      g.poly([-hw * 0.9, 0, 0, hh * 0.9, 0, hh * 0.9 - h, -hw * 0.9, -h]).fill(shade(wall, 0.78));
      g.poly([0, hh * 0.9, hw * 0.9, 0, hw * 0.9, -h, 0, hh * 0.9 - h]).fill(shade(wall, 1.0));
      g.poly([-hw * 0.9, -h, 0, hh * 0.9 - h, hw * 0.9, -h, 0, -hh * 0.9 - h]).fill(roof);
      g.poly([-hw * 0.9, -h, 0, hh * 0.9 - h, hw * 0.9, -h, 0, -hh * 0.9 - h]).stroke({ width: 1, color: shade(roof, 0.6) });
      g.poly([-hw * 0.2, hh * 0.9 - hh * 0.2, 0, hh * 0.9, 0, hh * 0.9 - h * 0.45, -hw * 0.2, hh * 0.9 - hh * 0.2 - h * 0.45]).fill(0x2a1a10);
    },
    (t) => {
      t.poly([-hw * 0.9, -h + 6, 0, hh * 0.9 - h + 6, 0, hh * 0.9 - h + 2, -hw * 0.9, -h + 2]).fill(0xffffff);
      t.poly([0, hh * 0.9 - h + 6, hw * 0.9, -h + 6, hw * 0.9, -h + 2, 0, hh * 0.9 - h + 2]).fill(0xffffff);
    },
  );
}

export function resourceArt(renderer: Renderer, kind: string): SpriteArt {
  return bake(renderer, (g) => {
    switch (kind) {
      case 'tree':
      case 'forestTree':
        g.ellipse(4, 0, 12, 5).fill(SHADOW);
        g.rect(-2, -14, 4, 14).fill(0x5a3a1e);
        g.circle(0, -24, 12).fill(kind === 'tree' ? 0x3f6e2a : 0x335e22);
        g.circle(-6, -30, 8).fill(kind === 'tree' ? 0x4c8034 : 0x3d6c28);
        g.circle(6, -32, 7).fill(kind === 'tree' ? 0x568c3a : 0x46782e);
        break;
      case 'goldMine':
        g.ellipse(0, 0, 18, 8).fill(SHADOW);
        g.poly([-14, 0, -8, -12, 2, -14, 12, -6, 14, 0]).fill(0x8a7a5a);
        g.circle(-4, -6, 3).fill(0xf2c440);
        g.circle(5, -8, 2.5).fill(0xf8d860);
        g.circle(8, -3, 2).fill(0xe8b030);
        break;
      case 'stoneMine':
        g.ellipse(0, 0, 18, 8).fill(SHADOW);
        g.poly([-15, 0, -10, -11, 0, -15, 11, -9, 15, 0]).fill(0x9a9a98);
        g.poly([-6, -4, -2, -12, 6, -10, 8, -3]).fill(0xb8b8b4);
        break;
      case 'berryBush':
        g.ellipse(0, 0, 13, 6).fill(SHADOW);
        g.circle(0, -8, 10).fill(0x3e6a2a);
        for (const [x, y] of [[-4, -10], [3, -12], [5, -6], [-2, -5], [0, -14]] as const) g.circle(x, y, 1.8).fill(0xc02a3a);
        break;
      case 'shoreFish':
        // A shoal just under the surface: dark backs and a couple of ripple rings.
        g.ellipse(0, 0, 16, 7).stroke({ color: 0xd8f0ff, alpha: 0.55, width: 1 });
        g.ellipse(2, 1, 9, 4).stroke({ color: 0xd8f0ff, alpha: 0.4, width: 1 });
        for (const [x, y, r] of [[-6, -1, 0.3], [4, -3, -0.4], [1, 3, 0.1]] as const) {
          g.ellipse(x, y, 4, 1.6).fill({ color: 0x1e3a4a, alpha: 0.75 });
          g.poly([x - 4, y, x - 7, y - 2 + r, x - 7, y + 2 + r]).fill({ color: 0x1e3a4a, alpha: 0.75 });
        }
        break;
      default:
        if (kind.startsWith('carcass:')) {
          // A fallen animal on its side: body, legs, a dark stain.
          const big = kind === 'carcass:elephant';
          const k = big ? 1.8 : 1;
          const body = big ? 0x7c7c80 : kind === 'carcass:gazelle' ? 0xb88a52 : 0x9a7040;
          g.ellipse(0, 0, 13 * k, 5 * k).fill({ color: 0x5a1a14, alpha: 0.45 });
          g.ellipse(0, -3 * k, 10 * k, 4 * k).fill(body);
          g.ellipse(9 * k, -4 * k, 3.5 * k, 2.6 * k).fill(body);
          for (const x of [-6, -3, 3, 6]) g.rect(x * k, -1 * k, 1.4 * k, 4 * k).fill(shade(body, 0.7));
          break;
        }
        g.ellipse(0, -2, 8, 4).fill({ color: 0xa0c8e0, alpha: 0.8 });
    }
  });
}

function shade(rgb: number, k: number): number {
  const r = Math.min(255, Math.round(((rgb >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((rgb >> 8) & 255) * k));
  const b = Math.min(255, Math.round((rgb & 255) * k));
  return (r << 16) | (g << 8) | b;
}
