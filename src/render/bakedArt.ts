import { Assets, Rectangle, Texture } from 'pixi.js';
import type { AtlasMeta } from '../art/bake/baker.ts';

export interface ArtFrame {
  tex: Texture;
  /** Anchor as a fraction of the frame size. */
  anchorX: number;
  anchorY: number;
  team: { tex: Texture; anchorX: number; anchorY: number } | null;
}

/**
 * Baked sprite atlases (public/baked, produced by tools/bake/cli.ts). Frames are 2× pixels; sprites are drawn at
 * scale 1/BAKE_SCALE in the world's logical-pixel space. Missing art (e.g. an unbaked checkout) simply means
 * `frame()` returns null and the renderer falls back to placeholder shapes.
 */
export class BakedArt {
  readonly models = new Map<string, { meta: AtlasMeta; frames: Map<string, ArtFrame>; pageSizes: { w: number; h: number }[] }>();

  static async load(base = './baked/'): Promise<BakedArt> {
    const art = new BakedArt();
    let manifest: { models: Record<string, { json: string }> };
    try {
      const r = await fetch(`${base}manifest.json`);
      if (!r.ok) return art;
      manifest = await r.json();
    } catch {
      return art;
    }
    await Promise.all(
      Object.entries(manifest.models).map(async ([id, m]) => {
        try {
          const meta = (await (await fetch(`${base}${m.json}`)).json()) as AtlasMeta;
          const pages = await Promise.all(meta.pages.map((p) => Assets.load<Texture>({ src: `${base}${p}`, data: { scaleMode: 'linear' } })));
          const frames = new Map<string, ArtFrame>();
          const make = (key: string): { tex: Texture; anchorX: number; anchorY: number } | null => {
            const f = meta.frames[key];
            if (!f || !f.w || !f.h) return null;
            const tex = new Texture({ source: pages[f.p]!.source, frame: new Rectangle(f.x, f.y, f.w, f.h) });
            return { tex, anchorX: f.ax / f.w, anchorY: f.ay / f.h };
          };
          for (const key of Object.keys(meta.frames)) {
            if (key.endsWith('#t')) continue;
            const b = make(key);
            if (b) frames.set(key, { ...b, team: make(`${key}#t`) });
          }
          art.models.set(id, { meta, frames, pageSizes: pages.map((p) => ({ w: p.source.pixelWidth, h: p.source.pixelHeight })) });
        } catch (e) {
          console.warn(`[art] failed to load ${id}`, e);
        }
      }),
    );
    return art;
  }

  has(id: string): boolean {
    return this.models.has(id);
  }

  meta(id: string): AtlasMeta | undefined {
    return this.models.get(id)?.meta;
  }

  pageSize(id: string, page: number): { w: number; h: number } {
    return this.models.get(id)?.pageSizes[page] ?? { w: 1, h: 1 };
  }

  frame(id: string, key: string): ArtFrame | null {
    return this.models.get(id)?.frames.get(key) ?? null;
  }
}
