import { BufferImageSource, Geometry, Mesh, Shader } from 'pixi.js';
import type { World } from '../sim/world.ts';
import { HALF_H, HALF_W } from './iso.ts';

/**
 * Fog overlay: one quad over the whole map diamond sampling a per-tile fog texture with linear filtering, so fog
 * edges are soft. Unexplored → black; explored but unwatched → half-dark; visible → clear (mil:6).
 */
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
  private lastExploredSum = -1;
  enabled = true;

  constructor(world: World) {
    this.world = world;
    const { w, h } = world.map;
    this.data = new Uint8Array(w * h * 4);
    this.source = new BufferImageSource({ resource: this.data, width: w, height: h, scaleMode: 'linear' });
    // Diamond corners with UVs at tile edges (texel centers are tile centers).
    const pos = new Float32Array([0, 0, w * HALF_W, w * HALF_H, (w - h) * HALF_W, (w + h) * HALF_H, -h * HALF_W, h * HALF_H]);
    const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const geometry = new Geometry({
      attributes: { aPosition: { buffer: pos, format: 'float32x2' }, aUV: { buffer: uv, format: 'float32x2' } },
      indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = Shader.from({ gl: { vertex: VERTEX, fragment: FRAGMENT }, resources: { uFog: this.source, uFogSampler: this.source.style } });
    this.mesh = new Mesh({ geometry, shader });
  }

  /** Refresh the fog texture for `player` (and allies sharing vision — later) when visibility changed. */
  update(player: number): void {
    const fog = this.world.fog;
    const version = fog.version[player] ?? 0;
    if (version === this.lastVersion) return;
    this.lastVersion = version;
    const vis = fog.vis[player]!;
    const exp = fog.explored[player]!;
    const d = this.data;
    let sum = 0;
    for (let i = 0; i < vis.length; i++) {
      const v = !this.enabled ? 255 : vis[i]! > 0 ? 255 : exp[i] ? 128 : 0;
      d[i * 4] = v;
      d[i * 4 + 3] = 255;
      sum += v;
    }
    if (sum !== this.lastExploredSum) {
      this.lastExploredSum = sum;
      this.source.update();
    }
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
