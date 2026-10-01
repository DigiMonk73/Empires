/**
 * Review sheets (M15.6 visual pass): lays screenshots out as captioned grids so a whole set can be scored a few
 * sheets at a time. Headless Chromium composes and shoots each sheet; nothing is shown on screen.
 *   node tools/contact-screens.ts <dir|file…> [--out artifacts/review/<name>] [--cols 3] [--rows 3] [--width 2560]
 * e.g. node tools/contact-screens.ts artifacts/screens/current/chromium --out artifacts/review/e2e-chromium
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name: string, dflt: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1]! : dflt;
};
const OUT = opt('out', 'artifacts/review/sheet');
const COLS = Number(opt('cols', '3'));
const ROWS = Number(opt('rows', '3'));
const WIDTH = Number(opt('width', '2560'));
const files = args.flatMap((a) => (statSync(a).isDirectory() ? readdirSync(a).filter((f) => f.endsWith('.png')).sort().map((f) => join(a, f)) : [a]));
if (!files.length) {
  console.error('no PNGs given');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const per = COLS * ROWS;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: WIDTH, height: 800 }, deviceScaleFactor: 1 });
const index: string[] = [];
for (let s = 0; s * per < files.length; s++) {
  const batch = files.slice(s * per, (s + 1) * per);
  const cells = batch
    .map((f) => `<figure><img src="${pathToFileURL(resolve(f)).href}"><figcaption>${basename(f, '.png')}</figcaption></figure>`)
    .join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; background: #111; font: 600 22px system-ui, sans-serif; color: #eee; }
    main { display: grid; grid-template-columns: repeat(${COLS}, 1fr); gap: 8px; padding: 8px; }
    figure { margin: 0; } img { width: 100%; display: block; } figcaption { padding: 4px 2px 8px; }
  </style><main>${cells}</main>`;
  const htmlFile = resolve(OUT, `sheet-${s + 1}.html`);
  writeFileSync(htmlFile, html);
  await page.goto(pathToFileURL(htmlFile).href);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  const file = join(OUT, `sheet-${s + 1}.png`);
  await page.screenshot({ path: file, fullPage: true });
  index.push(`- sheet-${s + 1}.png: ${batch.map((f) => basename(f, '.png')).join(', ')}`);
}
await browser.close();
writeFileSync(join(OUT, 'INDEX.md'), index.join('\n') + '\n');
console.log(`${files.length} images → ${Math.ceil(files.length / per)} sheet(s) in ${OUT}${existsSync(join(OUT, 'INDEX.md')) ? ' (INDEX.md)' : ''}`);
