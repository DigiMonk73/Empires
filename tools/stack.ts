/** Stack PNGs vertically into one review image: node tools/stack.ts out.png in1.png in2.png … */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [out, ...ins] = process.argv.slice(2);
if (!out || !ins.length) throw new Error('usage: node tools/stack.ts out.png in1.png …');
const imgs = ins.map((f) => PNG.sync.read(readFileSync(f)));
const W = Math.max(...imgs.map((i) => i.width));
const H = imgs.reduce((s, i) => s + i.height + 4, 0);
const dst = new PNG({ width: W, height: H });
dst.data.fill(30);
let y = 0;
for (const img of imgs) {
  PNG.bitblt(img, dst, 0, 0, img.width, img.height, 0, y);
  y += img.height + 4;
}
writeFileSync(out, PNG.sync.write(dst));
console.log(`${out}: ${W}×${H}`);
