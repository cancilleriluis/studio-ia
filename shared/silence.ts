// Detección de silencios para los cortes automáticos tipo "jump cut".
// Devuelve rangos en tiempo de la fuente que se pueden eliminar.

import type { Word } from './types';

export interface SilenceOptions {
  /** Sensibilidad 0..1: punto entre el ruido de fondo y la voz a partir del cual hay silencio (0,5 por defecto). */
  sensitivity?: number;
  /** Umbral fijo relativo al nivel de voz (dB). Si se indica, sustituye a la sensibilidad. */
  relativeDb?: number;
  minSilence?: number;
  /** Margen que se conserva alrededor de la voz. */
  pad?: number;
}

/** Energía suavizada (RMS en ventanas de ~90 ms) en dB. */
function smoothedDb(peaks: number[]): number[] {
  const win = 4;
  const sq = peaks.map((v) => v * v);
  const out = new Array<number>(peaks.length);
  for (let i = 0; i < peaks.length; i++) {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(peaks.length - 1, i + win); j++) {
      s += sq[j];
      n++;
    }
    out[i] = 20 * Math.log10(Math.max(Math.sqrt(s / n), 1e-5));
  }
  return out;
}

/**
 * Detecta pausas por energía. El umbral se adapta a cada grabación: se coloca entre
 * el ruido de fondo (percentil 15) y el nivel de voz (percentil 95).
 */
export function silencesFromPeaks(
  peaks: number[],
  rate: number,
  { sensitivity = 0.5, relativeDb, minSilence = 0.3, pad = 0.08 }: SilenceOptions = {},
): [number, number][] {
  if (!peaks.length) return [];
  const db = smoothedDb(peaks);
  const sorted = [...db].sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
  const noise = q(0.15);
  const speech = q(0.95);
  const thr = relativeDb !== undefined ? q(0.9) + relativeDb : noise + (speech - noise) * sensitivity;
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

/** Tramos con voz (complemento de los silencios detectados por energía). */
export function speechSegments(peaks: number[], rate: number, sensitivity = 0.5, minGap = 0.15): [number, number][] {
  const total = peaks.length / rate;
  const sil = silencesFromPeaks(peaks, rate, { sensitivity, minSilence: minGap, pad: 0 });
  const segs: [number, number][] = [];
  let cur = 0;
  for (const [a, b] of sil) {
    if (a > cur + 0.02) segs.push([cur, a]);
    cur = b;
  }
  if (total > cur + 0.02) segs.push([cur, total]);
  return segs;
}

/**
 * Ajusta los tiempos de Whisper (que tienden a pegar unas palabras con otras y a
 * meter las pausas dentro de ellas) a los tramos donde realmente hay voz.
 */
export function alignWords(words: Word[], segs: [number, number][]): Word[] {
  if (!segs.length) return words;
  const inSpeech = (t: number) => segs.some(([a, b]) => t >= a && t <= b);
  const speechWithin = (s: number, e: number) => segs.some(([a, b]) => a < e && b > s);
  const nextStart = (t: number) => segs.find(([a]) => a >= t)?.[0];
  const prevEnd = (t: number) => [...segs].reverse().find(([, b]) => b <= t)?.[1];
  const out: Word[] = [];
  for (const w of words) {
    let s = w.start;
    let e = w.end;
    const len = Math.max(0.08, Math.min(0.45, e - s));
    if (!speechWithin(s, e)) {
      // Palabra entera en silencio: llevarla al borde de voz más cercano
      const n = nextStart(e);
      const pv = prevEnd(s);
      if (n !== undefined && (pv === undefined || n - e <= s - pv)) {
        s = n;
        e = n + len;
      } else if (pv !== undefined) {
        e = pv;
        s = pv - len;
      }
    } else {
      if (!inSpeech(s)) s = nextStart(s) ?? s;
      if (!inSpeech(e)) e = prevEnd(e) ?? e;
    }
    out.push({ ...w, start: s, end: Math.max(e, s + 0.06) });
  }
  // Orden y sin solapes
  for (let i = 1; i < out.length; i++) {
    const p = out[i - 1];
    const c = out[i];
    if (c.start < p.end) {
      if (c.end > p.end + 0.06) c.start = p.end;
      else {
        p.end = Math.max(p.start + 0.04, c.start);
        if (c.start < p.end) c.start = p.end;
        c.end = Math.max(c.end, c.start + 0.06);
      }
    }
  }
  return out;
}
