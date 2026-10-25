// Detección de silencios para los cortes automáticos tipo "jump cut".
// Devuelve rangos en tiempo de la fuente que se pueden eliminar.

import type { Word } from './types';

export interface SilenceOptions {
  /** dB por debajo del nivel de voz típico para considerar silencio. */
  relativeDb?: number;
  minSilence?: number;
  /** Margen que se conserva alrededor de la voz. */
  pad?: number;
}

export function silencesFromPeaks(
  peaks: number[],
  rate: number,
  { relativeDb = -26, minSilence = 0.45, pad = 0.12 }: SilenceOptions = {},
): [number, number][] {
  if (!peaks.length) return [];
  const db = peaks.map((v) => 20 * Math.log10(Math.max(v, 1e-5)));
  const sorted = [...db].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)];
  const thr = loud + relativeDb;
  const out: [number, number][] = [];
  let startIdx = -1;
  for (let i = 0; i <= db.length; i++) {
    const silent = i < db.length && db[i] < thr;
    if (silent && startIdx < 0) startIdx = i;
    if (!silent && startIdx >= 0) {
      const a = startIdx / rate;
      const b = i / rate;
      if (b - a >= minSilence) {
        const isHead = startIdx === 0;
        const isTail = i === db.length;
        out.push([isHead ? 0 : a + pad, isTail ? b : b - pad]);
      }
      startIdx = -1;
    }
  }
  return out.filter(([a, b]) => b - a > 0.05);
}

export function silencesFromWords(
  words: Word[],
  sourceDuration: number,
  { minSilence = 0.45, pad = 0.1 }: SilenceOptions = {},
): [number, number][] {
  if (!words.length) return [];
  const out: [number, number][] = [];
  const first = words[0].start;
  if (first - pad > minSilence) out.push([0, first - pad]);
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i].end + pad;
    const b = words[i + 1].start - pad;
    if (b - a >= minSilence - 2 * pad && b > a) out.push([a, b]);
  }
  const last = words[words.length - 1].end;
  if (sourceDuration - last - pad > minSilence) out.push([last + pad, sourceDuration]);
  return out;
}
