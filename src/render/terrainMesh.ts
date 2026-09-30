import { Container, Geometry, Mesh, Shader } from 'pixi.js';
import { TERRAINS } from '../data/terrain.ts';
import type { TileMap } from '../sim/map/tilemap.ts';
import { ELEVATION_PX, HALF_H, HALF_W } from './iso.ts';
import { groundHeight } from './ground.ts';

/**
 * Terrain as GPU chunk meshes (16×16 tiles each). Vertices sit on a half-tile lattice: tile centers take the
 * tile's own color, edges and corners average their neighbors — so terrain blends smoothly across borders with
 * no visible grid. The fragment shader adds multi-octave value noise for grain. Hills (M10.1b): every vertex is
 * lifted by the ground height (16 px a level) and its colour shaded by the slope against the bakes' sun, so a
 * slope facing the upper left brightens and one facing away darkens (level ground keeps its colour exactly).
 */
export const CHUNK_TILES = 16;
const SUB = 2; // vertices per tile edge
/** The bakes' sun (art/bake/baker.ts SUN_DIR) as (x, up, y), normalised. */
const SUN = ((): [number, number, number] => {
  const v = [-0.6, 0.86, -0.2];
  const n = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / n, v[1]! / n, v[2]! / n];
})();
/** One elevation level in tile units of height (16 px over the 39.2 px a unit of height covers on screen). */
const LEVEL_UNITS = 0.408;

/** Light on the ground at (x, y) relative to level ground: Lambert on the slope normal, clamped. */
function slopeShade(map: TileMap, x: number, y: number): number {
  const gx = (groundHeight(map, x + 0.5, y) - groundHeight(map, x - 0.5, y)) * LEVEL_UNITS;
  const gy = (groundHeight(map, x, y + 0.5) - groundHeight(map, x, y - 0.5)) * LEVEL_UNITS;
  if (gx === 0 && gy === 0) return 1;
  const n = Math.hypot(gx, 1, gy);
  const lambert = (-gx * SUN[0] + SUN[1] - gy * SUN[2]) / n;
  // Exaggerated a little (×1.6 off level) so low hills still read at game zoom, as the original's did.
  return Math.min(1.4, Math.max(0.5, 1 + (lambert / SUN[1] - 1) * 1.6));
}

const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec3 aColor;
in vec2 aWorld;
out vec3 vColor;
out vec2 vWorld;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vColor = aColor;
  vWorld = aWorld;
}`;

const FRAGMENT = /* glsl */ `
precision highp float;
in vec3 vColor;
in vec2 vWorld;
out vec4 finalColor;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float n = vnoise(vWorld * 0.7) * 0.45 + vnoise(vWorld * 2.3) * 0.33 + vnoise(vWorld * 7.1) * 0.22;
  float grain = vnoise(vWorld * 23.0);
  vec3 c = vColor * (0.86 + 0.26 * n) * (0.96 + 0.08 * grain);
  finalColor = vec4(c, 1.0);
}`;

let sharedShader: Shader | null = null;
function terrainShader(): Shader {
  if (!sharedShader) sharedShader = Shader.from({ gl: { vertex: VERTEX, fragment: FRAGMENT }, resources: {} });
  return sharedShader;
}

function rgb(c: number): [number, number, number] {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

/** Terrain color of tile (tx, ty) with a little per-tile variation; clamps to the map edge. */
function tileColor(map: TileMap, tx: number, ty: number, out: [number, number, number]): void {
  const x = Math.min(map.w - 1, Math.max(0, tx));
  const y = Math.min(map.h - 1, Math.max(0, ty));
  const [r, g, b] = rgb(TERRAINS[map.terrain[y * map.w + x]!]!.color);
  out[0] = r;
  out[1] = g;
  out[2] = b;
}

export class TerrainLayer {
  readonly root = new Container();
  readonly chunks: { mesh: Mesh<Geometry, Shader>; x0: number; y0: number; x1: number; y1: number }[] = [];

  constructor(map: TileMap) {
    const cw = Math.ceil(map.w / CHUNK_TILES);
    const ch = Math.ceil(map.h / CHUNK_TILES);
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) this.buildChunk(map, cx * CHUNK_TILES, cy * CHUNK_TILES);
    }
  }

  private buildChunk(map: TileMap, tx0: number, ty0: number): void {
    const tw = Math.min(CHUNK_TILES, map.w - tx0);
    const th = Math.min(CHUNK_TILES, map.h - ty0);
    const vw = tw * SUB + 1;
    const vh = th * SUB + 1;
    const pos = new Float32Array(vw * vh * 2);
    const col = new Float32Array(vw * vh * 3);
    const wld = new Float32Array(vw * vh * 2);
    const a: [number, number, number] = [0, 0, 0];
    const acc = [0, 0, 0];
    for (let j = 0; j < vh; j++) {
      for (let i = 0; i < vw; i++) {
        const wx = tx0 + i / SUB;
        const wy = ty0 + j / SUB;
        const v = j * vw + i;
        pos[v * 2] = (wx - wy) * HALF_W;
        pos[v * 2 + 1] = (wx + wy) * HALF_H - groundHeight(map, wx, wy) * ELEVATION_PX;
        wld[v * 2] = wx;
        wld[v * 2 + 1] = wy;
        // Tiles touching this lattice point: centers → 1 tile, edge midpoints → 2, corners → 4.
        const oddX = i % SUB === 1;
        const oddY = j % SUB === 1;
        const xs = oddX ? [Math.floor(wx)] : [wx - 1, wx];
        const ys = oddY ? [Math.floor(wy)] : [wy - 1, wy];
        acc[0] = acc[1] = acc[2] = 0;
        for (const y of ys) for (const x of xs) {
          tileColor(map, x, y, a);
          acc[0] += a[0];
          acc[1] += a[1];
          acc[2] += a[2];
        }
        const n = xs.length * ys.length;
        const shade = slopeShade(map, wx, wy);
        col[v * 3] = (acc[0] / n) * shade;
        col[v * 3 + 1] = (acc[1] / n) * shade;
        col[v * 3 + 2] = (acc[2] / n) * shade;
      }
    }
    const idx = new Uint32Array((vw - 1) * (vh - 1) * 6);
    let k = 0;
    for (let j = 0; j < vh - 1; j++) {
      for (let i = 0; i < vw - 1; i++) {
        const p = j * vw + i;
        idx[k++] = p;
        idx[k++] = p + 1;
        idx[k++] = p + vw;
        idx[k++] = p + 1;
        idx[k++] = p + vw + 1;
        idx[k++] = p + vw;
      }
    }
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: pos, format: 'float32x2' },
        aColor: { buffer: col, format: 'float32x3' },
        aWorld: { buffer: wld, format: 'float32x2' },
      },
      indexBuffer: idx,
    });
    const mesh = new Mesh({ geometry, shader: terrainShader() });
    this.root.addChild(mesh);
    // Screen-space (iso) bounds of the chunk diamond, for culling.
    const x0 = (tx0 - (ty0 + th)) * HALF_W;
    const x1 = (tx0 + tw - ty0) * HALF_W;
    let top = 0;
    for (let y = ty0; y <= ty0 + th; y++) for (let x = tx0; x <= tx0 + tw; x++) top = Math.max(top, map.corner(x, y));
    const y0 = (tx0 + ty0) * HALF_H - top * ELEVATION_PX; // hills rise above the flat diamond
    const y1 = (tx0 + tw + ty0 + th) * HALF_H;
    this.chunks.push({ mesh, x0, y0, x1, y1 });
  }

  /** Hide chunks outside the iso-space view rectangle. Returns the visible chunk count (draw calls). */
  cull(vx0: number, vy0: number, vx1: number, vy1: number): number {
    let n = 0;
    for (const c of this.chunks) {
      const vis = c.x1 >= vx0 && c.x0 <= vx1 && c.y1 >= vy0 - 64 && c.y0 <= vy1 + 64;
      c.mesh.visible = vis;
      if (vis) n++;
    }
    return n;
  }
}
