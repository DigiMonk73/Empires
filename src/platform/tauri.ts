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
    // Drive whole frames (our update callbacks + Pixi's render, then wait for the GPU): rAF never fires in a hidden
    // window. The ticker gets a 60 fps clock of its own: WKWebView's coarse performance.now() can repeat, and the
    // ticker skips a frame whose time hasn't moved (M15.3: a run of 120 "frames" took 0 ms). The game runs at normal
    // speed against it. The first 30 frames aren't timed — the first tick, fog and minimap passes and texture
    // uploads are loading.
    let clock = performance.now();
    const frame = (): void => {
      clock += 1000 / 60;
      app.ticker.update(clock);
      gl.finish();
    };
    for (let i = 0; i < 30; i++) frame();
    const times: number[] = [];
    const tStart = performance.now();
    for (let i = 0; i < 120; i++) {
      const t0 = performance.now();
      frame();
      times.push(performance.now() - t0);
    }
    const renderMsAvg = (performance.now() - tStart) / times.length; // WKWebView timers are coarse; average is precise
    times.sort((a, b) => a - b);
    // What was drawn: the screen's own pixels (extracting the whole stage of a Gigantic map exceeds any texture).
    clock += 1000 / 60;
    app.ticker.update(clock);
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
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
    const art = report.art as { loaded: number } | null | undefined;
    report.ok = lumaSd > 2 && report.backend === 'webgl' && (!art || art.loaded > 0);
  } catch (e) {
    report.error = String(e);
  }
  await invoke('smoke_report', { report: JSON.stringify(report) });
}
