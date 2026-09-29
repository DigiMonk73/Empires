import * as THREE from 'three';

/**
 * Procedural material textures drawn on canvases (tileable). Deterministic: each texture uses its own seeded
 * hash so a bake is reproducible. Sizes are small (128–256 px) — sprites are tiny on screen.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function hex(c: number, k = 1): string {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * k)));
  return `rgb(${r},${g},${b})`;
}

/** Speckle noise over the whole canvas (grain). */
function grain(ctx: CanvasRenderingContext2D, size: number, r: () => number, amount: number, dots = 1.2): void {
  const n = Math.floor(size * size * dots * 0.05);
  for (let i = 0; i < n; i++) {
    const v = r();
    ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${amount * (0.5 - v)})` : `rgba(255,255,255,${amount * (v - 0.5)})`;
    ctx.fillRect(Math.floor(r() * size), Math.floor(r() * size), 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 2));
  }
}

export type TexKind =
  | 'stoneBlocks'
  | 'mudbrick'
  | 'plaster'
  | 'planks'
  | 'thatch'
  | 'cloth'
  | 'leather'
  | 'skin'
  | 'hair'
  | 'foliage'
  | 'bark'
  | 'rock'
  | 'goldOre'
  | 'metal'
  | 'plain';

export function makeTexture(kind: TexKind, base: number, seed = 1): THREE.CanvasTexture {
  const size = kind === 'plain' || kind === 'skin' || kind === 'metal' ? 64 : 256;
  const [c, ctx] = canvas(size);
  const r = rng(seed * 7919 + kind.length * 131);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);
  switch (kind) {
    case 'stoneBlocks': {
      const rows = 6;
      const h = size / rows;
      for (let y = 0; y < rows; y++) {
        const off = (y % 2) * 0.5;
        const cols = 3;
        const w = size / cols;
        for (let x = -1; x <= cols; x++) {
          const k = 0.82 + r() * 0.3;
          ctx.fillStyle = hex(base, k);
          ctx.fillRect((x + off) * w + 1.5, y * h + 1.5, w - 3, h - 3);
        }
        ctx.fillStyle = hex(base, 0.55);
        ctx.fillRect(0, y * h, size, 1.5);
      }
      grain(ctx, size, r, 0.35);
      break;
    }
    case 'mudbrick': {
      const rows = 10;
      const h = size / rows;
      for (let y = 0; y < rows; y++) {
        const w = size / 5;
        for (let x = -1; x <= 5; x++) {
          ctx.fillStyle = hex(base, 0.88 + r() * 0.2);
          ctx.fillRect((x + (y % 2) * 0.5) * w + 1, y * h + 1, w - 2, h - 2);
        }
      }
      grain(ctx, size, r, 0.3, 1.6);
      break;
    }
    case 'plaster':
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = hex(base, 0.9 + r() * 0.18);
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(r() * size, r() * size, 8 + r() * 30, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      grain(ctx, size, r, 0.18);
      break;
    case 'planks': {
      const n = 8;
      const w = size / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = hex(base, 0.8 + r() * 0.35);
        ctx.fillRect(i * w, 0, w - 1.5, size);
        for (let k = 0; k < 6; k++) {
          ctx.strokeStyle = hex(base, 0.7);
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          const x = i * w + r() * w;
          ctx.moveTo(x, 0);
          ctx.bezierCurveTo(x + (r() - 0.5) * 6, size * 0.3, x + (r() - 0.5) * 6, size * 0.7, x, size);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      break;
    }
    case 'thatch':
      for (let i = 0; i < 1400; i++) {
        const x = r() * size;
        const y = r() * size;
        ctx.strokeStyle = hex(base, 0.7 + r() * 0.55);
        ctx.lineWidth = 1 + r();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r() - 0.5) * 6, y + 10 + r() * 14);
        ctx.stroke();
      }
      break;
    case 'cloth':
      for (let y = 0; y < size; y += 2) {
        ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`;
        ctx.fillRect(0, y, size, 1);
      }
      grain(ctx, size, r, 0.12);
      break;
    case 'leather':
      grain(ctx, size, r, 0.3, 2);
      break;
    case 'hair':
      for (let i = 0; i < 500; i++) {
        ctx.strokeStyle = hex(base, 0.7 + r() * 0.5);
        ctx.beginPath();
        const x = r() * size;
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (r() - 0.5) * 10, size);
        ctx.stroke();
      }
      break;
    case 'foliage':
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = hex(base, 0.65 + r() * 0.6);
        ctx.beginPath();
        ctx.ellipse(r() * size, r() * size, 3 + r() * 6, 2 + r() * 4, r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'bark':
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = hex(base, 0.6 + r() * 0.4);
        ctx.fillRect(r() * size, 0, 2 + r() * 5, size);
      }
      grain(ctx, size, r, 0.3);
      break;
    case 'rock':
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = hex(base, 0.75 + r() * 0.45);
        ctx.beginPath();
        const x = r() * size;
        const y = r() * size;
        ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) ctx.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 40);
        ctx.fill();
      }
      grain(ctx, size, r, 0.3);
      break;
    case 'goldOre':
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = r() < 0.3 ? hex(0x8a7a58, 0.8 + r() * 0.4) : hex(0xf6cc48, 0.85 + r() * 0.3);
        ctx.beginPath();
        ctx.arc(r() * size, r() * size, 3 + r() * 10, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'metal':
      grain(ctx, size, r, 0.2);
      break;
    default:
      grain(ctx, size, r, 0.1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
