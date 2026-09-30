/**
 * UI textures (M9.8), drawn once at startup on seeded canvases so every run (and every screenshot) gets the same
 * pixels: carved stone for panels and bars, hammered bronze for buttons, parchment for information boxes. They go
 * into CSS custom properties (`--tex-stone`, `--tex-bronze`, `--tex-parch`); stylesheets layer their own tints
 * over them, and fall back to plain gradients if the properties are missing.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

const rgb = (r: number, g: number, b: number, k = 1, a = 1): string => `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${a})`;

/** Speckle: small light and dark flecks (tileable: flecks wrap at the edges). */
function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, amount: number): void {
  for (let i = 0; i < n; i++) {
    const v = r();
    ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${amount * (0.5 - v) * 2})` : `rgba(255,240,210,${amount * (v - 0.5) * 2})`;
    const x = Math.floor(r() * w);
    const y = Math.floor(r() * h);
    const s = 1 + Math.floor(r() * 2);
    ctx.fillRect(x, y, s, s);
  }
}

/** Dark carved stone: courses of blocks with worn edges, mortar shadows and grain. 256² tileable. */
function stone(): string {
  const W = 256;
  const [c, ctx] = canvas(W, W);
  const r = rng(7);
  ctx.fillStyle = rgb(46, 39, 31);
  ctx.fillRect(0, 0, W, W);
  const rows = 4;
  const h = W / rows;
  for (let y = 0; y < rows; y++) {
    const cols = 2 + (y % 2);
    const w = W / cols;
    const off = (y % 2) * (w / 2);
    for (let x = -1; x <= cols; x++) {
      const k = 0.85 + r() * 0.3;
      const x0 = x * w + off;
      ctx.fillStyle = rgb(60, 51, 41, k);
      ctx.fillRect(x0 + 2, y * h + 2, w - 4, h - 4);
      // Worn top edge catches the light, bottom edge falls into shadow.
      ctx.fillStyle = 'rgba(255,230,190,0.07)';
      ctx.fillRect(x0 + 2, y * h + 2, w - 4, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x0 + 2, y * h + h - 4, w - 4, 2);
    }
  }
  speckle(ctx, W, W, r, 5000, 0.18);
  // Soft mottling.
  for (let i = 0; i < 40; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 20 + r() * 40);
    const dark = r() < 0.5;
    g.addColorStop(0, dark ? 'rgba(0,0,0,0.12)' : 'rgba(255,230,190,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(r() * W, r() * W);
    ctx.fillStyle = g;
    ctx.fillRect(-60, -60, 120, 120);
    ctx.restore();
  }
  return c.toDataURL('image/png');
}

/** Hammered bronze: brushed streaks, dents and patina spots. 128² tileable across. */
function bronze(): string {
  const W = 128;
  const [c, ctx] = canvas(W, W);
  const r = rng(11);
  ctx.fillStyle = rgb(122, 90, 44);
  ctx.fillRect(0, 0, W, W);
  for (let y = 0; y < W; y++) {
    const k = 0.9 + r() * 0.2;
    ctx.fillStyle = rgb(122, 90, 44, k, 0.6);
    ctx.fillRect(0, y, W, 1);
  }
  for (let i = 0; i < 60; i++) {
    const x = r() * W;
    const y = r() * W;
    const g = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, 6 + r() * 6);
    g.addColorStop(0, 'rgba(255,225,150,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 12, y - 12, 24, 24);
  }
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(60,110,90,${0.08 + r() * 0.1})`; // verdigris
    ctx.beginPath();
    ctx.ellipse(r() * W, r() * W, 2 + r() * 5, 1 + r() * 3, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  speckle(ctx, W, W, r, 1200, 0.15);
  return c.toDataURL('image/png');
}

/** Parchment: warm paper with fibres and faint blotches. 256² tileable. */
function parchment(): string {
  const W = 256;
  const [c, ctx] = canvas(W, W);
  const r = rng(5);
  ctx.fillStyle = rgb(222, 204, 160);
  ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 30; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 20 + r() * 50);
    g.addColorStop(0, `rgba(150,110,60,${0.05 + r() * 0.07})`);
    g.addColorStop(1, 'rgba(150,110,60,0)');
    ctx.save();
    ctx.translate(r() * W, r() * W);
    ctx.fillStyle = g;
    ctx.fillRect(-70, -70, 140, 140);
    ctx.restore();
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < 700; i++) {
    ctx.strokeStyle = `rgba(120,90,50,${0.05 + r() * 0.08})`;
    const x = r() * W;
    const y = r() * W;
    const a = r() * Math.PI;
    const l = 3 + r() * 9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  speckle(ctx, W, W, r, 1500, 0.1);
  return c.toDataURL('image/png');
}

let installed = false;

/** Draw the textures and publish them as CSS custom properties on the document root. */
export function installUiTextures(root: HTMLElement = document.documentElement): void {
  if (installed) return;
  installed = true;
  try {
    root.style.setProperty('--tex-stone', `url(${stone()})`);
    root.style.setProperty('--tex-bronze', `url(${bronze()})`);
    root.style.setProperty('--tex-parch', `url(${parchment()})`);
  } catch (e) {
    console.warn('[ui] textures unavailable', e); // the stylesheets' plain gradients remain
  }
}
