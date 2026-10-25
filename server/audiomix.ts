// Mezcla de audio para la exportación usando exactamente las mismas curvas de
// ganancia (volumen, fundidos y ducking) que la previsualización del editor.

import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../shared/types';
import { audibleClips, clipGainAt, voiceRegions } from '../shared/audio';
import { decodePcm } from './ffmpeg';
import { mediaDir } from './store';

const RATE = 48000;
const BLOCK = 64;

export async function mixProjectAudio(p: Project, duration: number, outFile: string): Promise<void> {
  const frames = Math.ceil(duration * RATE);
  const mix = new Float32Array(frames * 2);
  const regions = voiceRegions(p);
  const dir = mediaDir(p.id);

  for (const clip of audibleClips(p)) {
    const asset = p.assets.find((a) => a.id === clip.assetId)!;
    const pcm = await decodePcm(path.join(dir, asset.file), {
      start: clip.in,
      duration: clip.duration * clip.speed,
      sampleRate: RATE,
      channels: 2,
      tempo: clip.speed,
    });
    const offset = Math.round(clip.start * RATE);
    const n = Math.min(pcm.length / 2, Math.round(clip.duration * RATE), frames - offset);
    for (let i = 0; i < n; i += BLOCK) {
      const t = clip.start + (i + BLOCK / 2) / RATE;
      const g = clipGainAt(p, clip, Math.min(t, clip.start + clip.duration), regions);
      if (g === 0) continue;
      const end = Math.min(n, i + BLOCK);
      for (let j = i; j < end; j++) {
        const o = (offset + j) * 2;
        if (o < 0) continue;
        mix[o] += pcm[j * 2] * g;
        mix[o + 1] += pcm[j * 2 + 1] * g;
      }
    }
  }

  // Limitador suave para evitar saturación digital
  const knee = 0.85;
  for (let i = 0; i < mix.length; i++) {
    const x = mix[i];
    const a = Math.abs(x);
    if (a > knee) mix[i] = Math.sign(x) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
  }
  writeWav16(outFile, mix, RATE, 2);
}

function writeWav16(file: string, data: Float32Array, rate: number, channels: number) {
  const bytes = data.length * 2;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + bytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}
