/**
 * Launches the built Empires.app in --smoke-test mode (hidden window, Accessory activation policy: no Dock
 * icon, no focus) and checks its JSON report. Never shows a window.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const bin = 'src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Empires.app/Contents/MacOS/empires';
if (!existsSync(bin)) {
  console.error(`missing ${bin} — run: npx tauri build --target aarch64-apple-darwin --bundles app`);
  process.exit(1);
}
const child = spawn(bin, ['--smoke-test'], { stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
child.stdout.on('data', (d) => (out += d));
child.stderr.on('data', (d) => (out += d));
const killer = setTimeout(() => child.kill('SIGKILL'), 120_000);
child.on('close', (code) => {
  clearTimeout(killer);
  const line = out.split('\n').find((l) => l.startsWith('SMOKE_REPORT '));
  mkdirSync('artifacts/tauri', { recursive: true });
  writeFileSync('artifacts/tauri/smoke.log', out);
  if (!line) {
    console.error(`no smoke report (exit ${code}):\n${out.slice(-2000)}`);
    process.exit(1);
  }
  const report = JSON.parse(line.slice('SMOKE_REPORT '.length));
  writeFileSync('artifacts/tauri/smoke.json', JSON.stringify(report, null, 2));
  const summary = `tauri smoke ${report.ok ? 'ok' : 'FAILED'}: ${report.glRenderer} · render avg ${Number(report.renderMsAvg).toFixed(3)} ms · p95 ${Number(report.renderMsP95).toFixed(2)} ms · luma sd ${Number(report.lumaSd).toFixed(1)}`;
  console.log(summary);
  process.exit(code === 0 && report.ok ? 0 : 1);
});
