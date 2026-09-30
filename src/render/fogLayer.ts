import { BufferImageSource, Geometry, Mesh, Shader } from 'pixi.js';
import type { World } from '../sim/world.ts';
import { ELEVATION_PX, HALF_H, HALF_W } from './iso.ts';
import { groundHeight } from './ground.ts';

/**
 * Fog overlay: a grid over the whole map, lifted to the drawn ground so it hugs the hills (M10.6), sampling a
 * per-tile fog texture with linear filtering, so fog edges are soft. Unexplored → black; explored but unwatched →
 * half-dark; visible → clear (mil:6). Changes ease in over half a second of real time instead of popping (a
 * paused game still clears where its units look); with the render clock frozen (screenshots) they snap.
 */
const FADE_MS = 450;
const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

const FRAGMENT = /* glsl */ `
precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uFog;
void main() {
  float v = texture(uFog, vUV).r;
  // 0 = unexplored, 0.5 = explored, 1 = visible → darkness 1 / 0.5 / 0 with softened transitions.
  float dark = 1.0 - smoothstep(0.0, 1.0, v);
  dark = mix(dark, dark * dark * 0.5 + dark * 0.5, 0.35);
  finalColor = vec4(0.0, 0.0, 0.0, dark * 0.97);
}`;

export class FogLayer {
  readonly mesh: Mesh<Geometry, Shader>;
  private readonly data: Uint8Array;
  private readonly source: BufferImageSource;
  private readonly world: World;
  private lastVersion = -1;
  /** Per tile: the level shown now, the level it is heading to, where it started and when (ticks). */
  private readonly cur: Float32Array;
  private readonly target: Uint8Array;
  private readonly from: Float32Array;
  private readonly since: Float64Array;
  private animating: number[] = [];
  private primed = false;
  enabled = true;
  /** Show every change at once (the render clock is frozen for a screenshot). */
  snap = false;

  constructor(world: World) {
    this.world = world;
    const { w, h } = world.map;
    this.data = new Uint8Array(w * h * 4);
    this.cur = new Float32Array(w * h);
    this.target = new Uint8Array(w * h);
    this.from = new Float32Array(w * h);
    this.since = new Float64Array(w * h);
    this.source = new BufferImageSource({ resource: this.data, width: w, height: h, scaleMode: 'linear' });
    // A vertex on every tile corner at its drawn ground height; UVs at tile edges (texel centres = tile centres).
    const N = (w + 1) * (h + 1);
    const pos = new Float32Array(N * 2);
    const uv = new Float32Array(N * 2);
    for (let y = 0; y <= h; y++) {
      for (let x = 0; x <= w; x++) {
        const v = y * (w + 1) + x;
        pos[v * 2] = (x - y) * HALF_W;
        pos[v * 2 + 1] = (x + y) * HALF_H - groundHeight(world.map, x, y) * ELEVATION_PX;
        uv[v * 2] = x / w;
        uv[v * 2 + 1] = y / h;
      }
    }
    const idx = new Uint32Array(w * h * 6);
    let k = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * (w + 1) + x;
        idx[k++] = p;
        idx[k++] = p + 1;
        idx[k++] = p + w + 1;
        idx[k++] = p + 1;
        idx[k++] = p + w + 2;
        idx[k++] = p + w + 1;
      }
    }
    const geometry = new Geometry({
      attributes: { aPosition: { buffer: pos, format: 'float32x2' }, aUV: { buffer: uv, format: 'float32x2' } },
      indexBuffer: idx,
    });
    const shader = Shader.from({ gl: { vertex: VERTEX, fragment: FRAGMENT }, resources: { uFog: this.source, uFogSampler: this.source.style } });
    this.mesh = new Mesh({ geometry, shader });
  }

  /**
   * Refresh the fog texture for `player` (and allies sharing vision — later): new targets when visibility changed,
   * then ease every changing tile toward its target (`now` in ms).
   */
  update(player: number, now = performance.now()): void {
    const fog = this.world.fog;
    const version = fog.version[player] ?? 0;
    const d = this.data;
    let dirty = false;
    if (version !== this.lastVersion) {
      this.lastVersion = version;
      const vis = fog.vis[player]!;
      const exp = fog.explored[player]!;
      for (let i = 0; i < vis.length; i++) {
        const v = !this.enabled ? 255 : vis[i]! > 0 ? 255 : exp[i] ? 128 : 0;
        if (!this.primed) {
          // The opening view appears as it is (no fade-in of the whole map).
          this.cur[i] = this.target[i] = v;
          d[i * 4] = v;
          d[i * 4 + 3] = 255;
          dirty = true;
        } else if (v !== this.target[i]) {
          if (this.cur[i] === this.target[i]) this.animating.push(i);
          this.target[i] = v;
          this.from[i] = this.cur[i]!;
          this.since[i] = now;
        }
      }
      this.primed = true;
    }
    if (this.animating.length) {
      let k = 0;
      for (const i of this.animating) {
        const u = this.snap ? 1 : Math.min(1, Math.max(0, (now - this.since[i]!) / FADE_MS));
        const e = u * u * (3 - 2 * u);
        const v = this.from[i]! + (this.target[i]! - this.from[i]!) * e;
        this.cur[i] = u >= 1 ? this.target[i]! : v;
        d[i * 4] = Math.round(this.cur[i]!);
        d[i * 4 + 3] = 255;
        if (u < 1) this.animating[k++] = i;
      }
      this.animating.length = k;
      dirty = true;
    }
    if (dirty) this.source.update();
  }

  isVisible(player: number, tx: number, ty: number): boolean {
    if (!this.enabled) return true;
    const m = this.world.map;
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false;
    return this.world.fog.vis[player]![ty * m.w + tx]! > 0;
  }

  isExplored(player: number, tx: number, ty: number): boolean {
    if (!this.enabled) return true;
    const m = this.world.map;
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false;
    return this.world.fog.explored[player]![ty * m.w + tx] === 1;
  }
}
