import type { Application } from 'pixi.js';

export const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;

/**
 * Hidden-window smoke test (Tauri `--smoke-test`). Renders frames manually (rAF may be paused for hidden
 * windows), reads pixels back to prove something was drawn, and reports JSON to the Rust side, which exits.
 */
export async function runTauriSmokeTest(app: Application, extra: () => Record<string, unknown>): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  const report: Record<string, unknown> = { ok: false };
  try {
    const gl = (app.renderer as unknown as { gl: WebGL2RenderingContext }).gl;
    const times: number[] = [];
    const tStart = performance.now();
    for (let i = 0; i < 120; i++) {
      const t0 = performance.now();
      // Drive the whole frame (our update callbacks + Pixi's render): rAF never fires in a hidden window.
      app.ticker.update(t0);
      gl.finish();
      times.push(performance.now() - t0);
    }
    const renderMsAvg = (performance.now() - tStart) / times.length; // WKWebView timers are coarse; average is precise
    times.sort((a, b) => a - b);
    const pixels = app.renderer.extract.pixels(app.stage).pixels;
    let sum = 0;
    let sum2 = 0;
    let n = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      const l = 0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!;
      sum += l;
      sum2 += l * l;
      n++;
    }
    const mean = sum / n;
    const lumaSd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    Object.assign(report, extra(), {
      frames: times.length,
      renderMsAvg,
      renderMsMedian: times[times.length >> 1],
      renderMsP95: times[Math.floor(times.length * 0.95)],
      lumaMean: mean,
      lumaSd,
      userAgent: navigator.userAgent,
    });
    report.ok = lumaSd > 2 && report.backend === 'webgl';
  } catch (e) {
    report.error = String(e);
  }
  await invoke('smoke_report', { report: JSON.stringify(report) });
}
