import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

/**
 * M3.2 calibration: baked flat tile and 3×3 box must match the runtime iso projection (64×32 logical tiles,
 * 16 logical px per 0.408 units of height) — IoU ≥ 0.98 at 2× (DECISIONS D11).
 */
interface Frame {
  p: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

function load(id: string): { frame: Frame; png: PNG } {
  const meta = JSON.parse(readFileSync(`public/baked/${id}.json`, 'utf8'));
  const png = PNG.sync.read(readFileSync(`public/baked/${meta.pages[0]}`));
  return { frame: meta.frames.v0 as Frame, png };
}

function inPoly(poly: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** IoU between the frame's alpha > 50% and a polygon given relative to the anchor (2× px). */
function iou(id: string, poly: [number, number][]): number {
  const { frame: f, png } = load(id);
  let inter = 0;
  let union = 0;
  const minX = Math.floor(Math.min(...poly.map((p) => p[0]))) - 4;
  const maxX = Math.ceil(Math.max(...poly.map((p) => p[0]))) + 4;
  const minY = Math.floor(Math.min(...poly.map((p) => p[1]))) - 4;
  const maxY = Math.ceil(Math.max(...poly.map((p) => p[1]))) + 4;
  for (let y = Math.min(minY, -f.ay); y <= Math.max(maxY, f.h - f.ay); y++) {
    for (let x = Math.min(minX, -f.ax); x <= Math.max(maxX, f.w - f.ax); x++) {
      const fx = x + f.ax;
      const fy = y + f.ay;
      const a = fx >= 0 && fy >= 0 && fx < f.w && fy < f.h ? png.data[((f.y + fy) * png.width + f.x + fx) * 4 + 3]! > 127 : false;
      const b = inPoly(poly, x + 0.5, y + 0.5);
      if (a && b) inter++;
      if (a || b) union++;
    }
  }
  const r = inter / union;
  console.log(`calibration ${id}: IoU ${r.toFixed(4)}`);
  return r;
}

describe('bake calibration', () => {
  it('a 1×1 flat tile bakes to the 128×64 iso diamond', () => {
    expect(iou('calTile', [[0, -32], [64, 0], [0, 32], [-64, 0]])).toBeGreaterThan(0.98);
  });

  it('a 3×3×0.6 box bakes to the iso footprint extruded by 0.6 × 78.4 px', () => {
    const h = 0.6 * 2 * 32 * Math.SQRT2 * Math.cos(Math.PI / 6);
    const poly: [number, number][] = [[0, -96 - h], [192, -h], [192, 0], [0, 96], [-192, 0], [-192, -h]];
    expect(iou('calBox', poly)).toBeGreaterThan(0.98);
  });
});
