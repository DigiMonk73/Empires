/**
 * Screenshot review support. Compares artifacts/screens/current against artifacts/screens/baseline (the last
 * green verify), flags blank frames and missing-texture magenta, and writes artifacts/screens/CHANGED.md so the
 * loop only opens images that changed. `--accept` promotes current → baseline.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const DIR = 'artifacts/screens';
const CURRENT = join(DIR, 'current');
const BASELINE = join(DIR, 'baseline');
const DIFF = join(DIR, 'diff');

export interface ScreenResult {
  name: string;
  status: 'new' | 'changed' | 'same';
  diffPct: number;
  problems: string[];
}

function list(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) list(p, out);
    else if (n.endsWith('.png')) out.push(p);
  }
  return out;
}

function inspect(png: PNG): string[] {
  const problems: string[] = [];
  const { data } = png;
  let sum = 0;
  let sum2 = 0;
  let magenta = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += l;
    sum2 += l * l;
    if (r === 255 && g === 0 && b === 255) magenta++;
  }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  if (sd < 2) problems.push(`blank frame (luma sd ${sd.toFixed(2)})`);
  if (magenta > 50) problems.push(`${magenta} missing-texture magenta pixels`);
  return problems;
}

export function compareScreens(): ScreenResult[] {
  const results: ScreenResult[] = [];
  rmSync(DIFF, { recursive: true, force: true });
  for (const file of list(CURRENT).sort()) {
    const name = relative(CURRENT, file);
    const cur = PNG.sync.read(readFileSync(file));
    const problems = inspect(cur);
    const basePath = join(BASELINE, name);
    if (!existsSync(basePath)) {
      results.push({ name, status: 'new', diffPct: 100, problems });
      continue;
    }
    const base = PNG.sync.read(readFileSync(basePath));
    if (base.width !== cur.width || base.height !== cur.height) {
      results.push({ name, status: 'changed', diffPct: 100, problems });
      continue;
    }
    const diff = new PNG({ width: cur.width, height: cur.height });
    const px = pixelmatch(base.data, cur.data, diff.data, cur.width, cur.height, { threshold: 0.1 });
    const diffPct = (100 * px) / (cur.width * cur.height);
    const changed = diffPct > 0.05;
    if (changed) {
      const out = join(DIFF, name);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, PNG.sync.write(diff));
    }
    results.push({ name, status: changed ? 'changed' : 'same', diffPct, problems });
  }
  const lines = ['# Screenshots', ''];
  const changed = results.filter((r) => r.status !== 'same');
  lines.push(changed.length ? `${changed.length} new/changed of ${results.length}. Review these:` : `No changes across ${results.length} screenshots.`, '');
  for (const r of changed) lines.push(`- **${r.status}** \`${join(CURRENT, r.name)}\`${r.status === 'changed' ? ` (${r.diffPct.toFixed(2)}% px; diff \`${join(DIFF, r.name)}\`)` : ''}`);
  const bad = results.filter((r) => r.problems.length);
  if (bad.length) {
    lines.push('', '## Problems');
    for (const r of bad) lines.push(`- \`${r.name}\`: ${r.problems.join('; ')}`);
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, 'CHANGED.md'), lines.join('\n') + '\n');
  return results;
}

export function acceptScreens(): void {
  if (!existsSync(CURRENT)) return;
  rmSync(BASELINE, { recursive: true, force: true });
  cpSync(CURRENT, BASELINE, { recursive: true });
}

if (import.meta.main) {
  if (process.argv.includes('--accept')) acceptScreens();
  else {
    const r = compareScreens();
    console.log(readFileSync(join(DIR, 'CHANGED.md'), 'utf8'));
    if (r.some((x) => x.problems.length)) process.exit(1);
  }
}
