import { MODEL_BY_ID, MODELS } from '../models/index.ts';
import { Baker, BAKER_VERSION, type AtlasMeta } from './baker.ts';
import { contactSheet } from './contact.ts';

/** Headless bake API used by tools/bake/cli.ts (Playwright). */
declare global {
  interface Window {
    __bake?: {
      version: number;
      list(): string[];
      /** `pages`: WebP for the game; `pngs`: the same pages lossless, for review tools and calibration. */
      bake(id: string): { meta: AtlasMeta; pages: string[]; pngs: string[]; contact: string; ms: number; renderer: string };
    };
  }
}

let baker: Baker | null = null;
const WEBP_QUALITY = 0.9;

window.__bake = {
  version: BAKER_VERSION,
  list: () => MODELS.map((m) => m.id),
  bake(id) {
    const def = MODEL_BY_ID.get(id);
    if (!def) throw new Error(`unknown model ${id}`);
    baker ??= new Baker();
    const t0 = performance.now();
    const { meta, pages } = baker.bake(def);
    const contact = contactSheet(meta, pages).toDataURL('image/png');
    const gl = baker.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      meta,
      // Lossy WebP at 0.9 (KI-6): a fifth of the PNG size; the shipped atlases decode in Chromium, WebKit and
      // WKWebView alike.
      pages: pages.map((p) => p.toDataURL('image/webp', WEBP_QUALITY)),
      pngs: pages.map((p) => p.toDataURL('image/png')),
      contact,
      ms: performance.now() - t0,
      renderer: String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
    };
  },
};
