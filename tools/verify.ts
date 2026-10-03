/**
 * The single quality gate (docs/LOOP.md). Runs every check, writes artifacts/verify/summary.{md,json}, and exits
 * non-zero if any gate fails. `--full` adds the milestone-end checks (Docker, Tauri, StartOS package).
 * `--only a,b` runs a subset (for iteration; a commit still needs a full `npm run verify`).
 */
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { acceptScreens, compareScreens } from './screens.ts';

interface Step {
  id: string;
  title: string;
  cmd?: string[];
  fn?: () => Promise<string>;
  needs?: string[];
  full?: boolean;
  enabled?: () => boolean;
}

interface Result {
  id: string;
  title: string;
  status: 'pass' | 'fail' | 'skip';
  seconds: number;
  note: string;
  tail?: string;
}

const OUT = 'artifacts/verify';
const LOGS = join(OUT, 'logs');
const full = process.argv.includes('--full');
const onlyArg = process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined);
const only = onlyArg ? new Set(onlyArg.split(',')) : null;

const STEPS: Step[] = [
  { id: 'typecheck', title: 'TypeScript (sim / app / tools)', cmd: ['npm', 'run', '-s', 'typecheck'] },
  { id: 'purity', title: 'Sim purity', cmd: ['node', 'tools/check-purity.ts'] },
  { id: 'bake', title: 'Bake sprites (incremental) → public/baked', cmd: ['node', 'tools/bake/cli.ts'] },
  { id: 'unit', title: 'Unit + determinism tests (vitest)', cmd: ['npx', 'vitest', 'run'], needs: ['bake'] },
  // M15.7: every unit, building and technology the research lists is in the data and reached by a test.
  { id: 'done', title: 'Done audit: content complete and tested', cmd: ['node', 'tools/done-audit.ts', '--check'] },
  {
    id: 'sim',
    title: 'Headless sim stress (500 units, fuzzed orders)',
    fn: async () => {
      const note = await run('sim', ['node', 'tools/sim/cli.ts', '--ticks', '4000', '--out', 'artifacts/sim/stress.json']);
      recordMetrics();
      return note;
    },
  },
  {
    id: 'econ',
    title: 'Economy benchmark (rates, trip efficiency, idle)',
    cmd: ['node', 'tools/sim/econ.ts', '--record'],
  },
  {
    id: 'battle',
    title: 'Battle benchmark (20v20 × 3 seeds)',
    cmd: ['node', 'tools/sim/battle.ts', '--record'],
  },
  {
    id: 'perf',
    title: 'Sim at full population (8 × 50 pop, Gigantic, 5 min; p99 ≤ 6 ms)',
    cmd: ['node', 'tools/sim/perf.ts', '--record'],
  },
  {
    id: 'ai',
    title: 'AI suite (4 timing + 24 war matches)',
    cmd: ['node', 'tools/sim/ai-suite.ts', '--record'],
  },
  {
    id: 'aiFull',
    title: 'AI suite full (the Done suite: 500 games — ladder, water, hard duels, free-for-alls)',
    cmd: ['node', 'tools/sim/ai-suite.ts', '--full', '--adjacent'],
    full: true,
  },
  {
    id: 'audio',
    title: 'Audio check (peaks, music gaps, spectrograms)',
    cmd: ['node', 'tools/audio-check.ts'],
    full: true,
  },
  { id: 'build', title: 'Vite build', cmd: ['npx', 'vite', 'build'] },
  {
    id: 'e2e',
    title: 'Playwright e2e (Chromium + WebKit)',
    needs: ['build'],
    fn: async () => {
      const cur = 'artifacts/screens/current';
      if (existsSync(cur)) rmSync(cur, { recursive: true, force: true });
      return run('e2e', ['npx', 'playwright', 'test']);
    },
  },
  {
    id: 'screens',
    title: 'Screenshot diff + sanity',
    needs: ['e2e'],
    fn: async () => {
      const r = compareScreens();
      const problems = r.filter((x) => x.problems.length);
      if (problems.length) throw new Error(problems.map((p) => `${p.name}: ${p.problems.join('; ')}`).join('\n'));
      const changed = r.filter((x) => x.status !== 'same').length;
      return `${r.length} screenshots, ${changed} new/changed → artifacts/screens/CHANGED.md`;
    },
  },
  {
    // M15.1 (Done 2): 100 seeds × 24k ticks of 4 AIs — Node (straight, save → load → continue, replay), then
    // Chromium and WebKit against Node's traces, with the 10 big fuzz seeds of determinism.spec.ts.
    id: 'determinism',
    title: 'Determinism at scale (100 4-AI games × 24k ticks: Node save/load/replay, Chromium, WebKit)',
    full: true,
    needs: ['build'],
    fn: async () => {
      const node = await run('determinism-node', ['node', 'tools/sim/determinism.ts']);
      const web = await run('determinism-web', ['npx', 'playwright', 'test', 'tests/e2e/determinism-scale.spec.ts', 'tests/e2e/determinism.spec.ts', '--workers', '12'], { EMPIRES_SCALE: '1', EMPIRES_FULL: '1' });
      return `${node.replace(/^determinism: /, '').split(' · ')[0]} · browsers: ${web}`;
    },
  },
  {
    // M15.4 (D64): two-hour games — headless (8 Hard on Gigantic; 4 mixed 2v2 on water) and one in Chromium.
    id: 'soak',
    title: 'Two-hour soak (Node: 2 games; Chromium: 1) — crash, heap, stuck, frame times',
    full: true,
    needs: ['build'],
    fn: async () => {
      const node = await run('soak-node', ['node', '--expose-gc', 'tools/sim/soak.ts', '--record']);
      const web = await run('soak-web', ['npx', 'playwright', 'test', 'tests/e2e/soak.spec.ts', '--project', 'chromium'], { EMPIRES_SOAK: '1' });
      return `${node.replace(/^soak 2 h: /, '').replace(/ \(\d+ s\)/g, '').slice(0, 150)} · browser: ${web}`;
    },
  },
  {
    id: 'docker',
    title: 'Docker buildx (amd64 + arm64) + /healthz',
    full: true,
    enabled: () => existsSync('Dockerfile'),
    fn: async () => {
      await run('docker-build', ['docker', 'buildx', 'build', '--platform', 'linux/amd64,linux/arm64', '-t', 'empires:verify', '.']);
      await run('docker-load', ['docker', 'buildx', 'build', '--platform', 'linux/arm64', '--load', '-t', 'empires:verify-arm64', '.']);
      return run('docker-smoke', ['node', 'tools/docker-smoke.ts', 'empires:verify-arm64']);
    },
  },
  {
    id: 'tauri',
    title: 'Tauri .app build + hidden smoke test',
    full: true,
    enabled: () => existsSync('src-tauri/tauri.conf.json'),
    fn: async () => {
      await run('tauri-build', ['npx', 'tauri', 'build', '--target', 'aarch64-apple-darwin', '--bundles', 'app']);
      return run('tauri-smoke', ['node', 'tools/tauri-smoke.ts']);
    },
  },
  {
    id: 'startos',
    title: 'StartOS package build (make arm)',
    full: true,
    enabled: () => existsSync('../empires-startos/Makefile'),
    fn: async () => run('startos', ['make', '-C', '../empires-startos', 'arm'], { PATH: `/Users/b1ackswan/code/btctx-vm-lab/bin:${process.env.PATH}` }),
  },
];

let currentLog = '';

/** Append this run's key metrics to docs/metrics/history.csv (committed with the change). */
function recordMetrics(): void {
  const r = JSON.parse(readFileSync('artifacts/sim/stress.json', 'utf8'));
  const file = 'docs/metrics/history.csv';
  mkdirSync('docs/metrics', { recursive: true });
  const header = 'date,commit,sim_p50_ms,sim_p99_ms,blocked_pct,stuck_units,gave_up,searches,avg_path_work\n';
  if (!existsSync(file)) writeFileSync(file, header);
  let commit = 'dirty';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {}
  const row = [new Date().toISOString().slice(0, 16), commit, r.tickMs.p50.toFixed(3), r.tickMs.p99.toFixed(3), r.movement.blockedPct.toFixed(2),
    r.movement.stuckOver5sUnits, r.movement.gaveUp, r.pathing.served, r.pathing.avgWork.toFixed(0)].join(',');
  appendFileSync(file, row + '\n');
}

function run(id: string, cmd: string[], env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const logFile = join(LOGS, `${id}.log`);
    currentLog = logFile;
    let output = '';
    const child = spawn(cmd[0]!, cmd.slice(1), { env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('error', (e) => reject(e));
    child.on('close', (code) => {
      writeFileSync(logFile, output);
      if (code === 0) resolve(lastLine(output));
      else reject(Object.assign(new Error(`exit ${code}`), { output }));
    });
  });
}

const ANSI = /\u001b\[[0-9;]*m/g;

function lastLine(s: string): string {
  const lines = s.replace(ANSI, '').trim().split('\n').filter((l) => l.trim());
  // Prefer a summary line (vitest/playwright print tips after it).
  const summary = [...lines].reverse().find((l) => /^\s*Tests\s+\d+ passed|^\s*\d+ passed \(/.test(l));
  return (summary ?? lines[lines.length - 1] ?? '').trim().slice(0, 200);
}

function tail(s: string, n = 40): string {
  return s.replace(ANSI, '').trim().split('\n').slice(-n).join('\n');
}

async function main(): Promise<void> {
  mkdirSync(LOGS, { recursive: true });
  const results: Result[] = [];
  const status = new Map<string, Result['status']>();
  const t0 = Date.now();
  for (const step of STEPS) {
    const res: Result = { id: step.id, title: step.title, status: 'skip', seconds: 0, note: '' };
    if ((step.full && !full) || (only && !only.has(step.id))) {
      res.note = step.full && !full ? 'full only' : 'not selected';
      results.push(res);
      status.set(step.id, 'skip');
      continue;
    }
    if (step.enabled && !step.enabled()) {
      res.note = 'not set up yet';
      results.push(res);
      status.set(step.id, 'skip');
      continue;
    }
    const blocked = (step.needs ?? []).find((d) => status.get(d) === 'fail');
    if (blocked) {
      res.note = `blocked by ${blocked}`;
      results.push(res);
      status.set(step.id, 'fail');
      res.status = 'fail';
      continue;
    }
    const s0 = Date.now();
    process.stdout.write(`▶ ${step.title} … `);
    try {
      res.note = step.fn ? await step.fn() : await run(step.id, step.cmd!);
      res.status = 'pass';
    } catch (e) {
      res.status = 'fail';
      const err = e as Error & { output?: string };
      res.note = err.message.split('\n')[0]!.slice(0, 160);
      res.tail = tail(err.output ?? err.message);
      if (!err.output && currentLog) res.note += ` (log: ${currentLog})`;
    }
    res.seconds = (Date.now() - s0) / 1000;
    status.set(step.id, res.status);
    results.push(res);
    console.log(`${res.status.toUpperCase()} (${res.seconds.toFixed(1)}s) ${res.note}`);
    // Print now. A later step can run until the runner's time limit, and that limit used to discard this.
    if (res.status === 'fail' && res.tail) console.log(`\n── ${res.title} ──\n${res.tail}`);
  }
  const failed = results.filter((r) => r.status === 'fail');
  const total = (Date.now() - t0) / 1000;
  const md = [
    `# Verify ${failed.length ? '❌ FAILED' : '✅ PASSED'}${full ? ' (full)' : ''}`,
    '',
    `Finished ${new Date().toISOString()} in ${total.toFixed(1)} s.`,
    '',
    '| Step | Status | Seconds | Note |',
    '|---|---|---|---|',
    ...results.map((r) => `| ${r.title} | ${r.status} | ${r.seconds.toFixed(1)} | ${r.note.replace(/\|/g, '\\|')} |`),
    '',
    ...failed.filter((r) => r.tail).flatMap((r) => [`## ${r.title}`, '', '```', r.tail!, '```', '']),
  ].join('\n');
  writeFileSync(join(OUT, 'summary.md'), md);
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ passed: !failed.length, full, seconds: total, results }, null, 2));
  if (!failed.length && status.get('screens') === 'pass') acceptScreens();
  console.log(`\n${failed.length ? 'VERIFY FAILED' : 'VERIFY PASSED'} in ${total.toFixed(1)} s → ${join(OUT, 'summary.md')}`);
  if (failed.length) {
    for (const r of failed) if (r.tail) console.log(`\n── ${r.title} ──\n${r.tail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
