/** Minimal mono 16-bit PCM WAV reading and writing for the audio tools. */
import { readFileSync, writeFileSync } from 'node:fs';

export interface Wav {
  rate: number;
  samples: Int16Array;
}

export function readWav(path: string): Wav {
  const b = readFileSync(path);
  let off = 12;
  let rate = 22050;
  let data: Buffer | null = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const len = b.readUInt32LE(off + 4);
    if (id === 'fmt ') rate = b.readUInt32LE(off + 12);
    if (id === 'data') data = b.subarray(off + 8, off + 8 + len);
    off += 8 + len + (len & 1);
  }
  if (!data) throw new Error(`no data chunk in ${path}`);
  return { rate, samples: new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length)) };
}

export function writeWav(path: string, w: Wav): void {
  const n = w.samples.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(w.rate, 24);
  b.writeUInt32LE(w.rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(w.samples[i]!, 44 + i * 2);
  writeFileSync(path, b);
}
