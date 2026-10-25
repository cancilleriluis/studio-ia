import { useEffect, useRef } from 'react';
import { meterLevels } from '../engine/audioEngine';

const MIN_DB = -48;
const toDb = (v: number) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const norm = (db: number) => Math.max(0, Math.min(1, (db - MIN_DB) / -MIN_DB));

/** Medidores de pico del bus maestro (verde, ámbar a −12 dB, rojo a −3 dB) con retención de pico. */
export function Meters() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const level = [0, 0];
    const hold = [0, 0];
    const holdAt = [0, 0];
    const draw = (now: number) => {
      const c = ref.current;
      if (c) {
        const dpr = window.devicePixelRatio || 1;
        const w = c.clientWidth;
        const h = c.clientHeight;
        if (c.width !== w * dpr || c.height !== h * dpr) {
          c.width = w * dpr;
          c.height = h * dpr;
        }
        const ctx = c.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const peaks = meterLevels();
        const top = 16;
        const mh = h - top - 6;
        const bw = 8;
        for (let ch = 0; ch < 2; ch++) {
          const n = norm(toDb(peaks[ch]));
          level[ch] = Math.max(n, level[ch] - 0.012);
          if (n >= hold[ch]) {
            hold[ch] = n;
            holdAt[ch] = now;
          } else if (now - holdAt[ch] > 1200) hold[ch] = Math.max(0, hold[ch] - 0.01);
          const x = 6 + ch * (bw + 3);
          ctx.fillStyle = '#1e2025';
          ctx.fillRect(x, top, bw, mh);
          const grad = ctx.createLinearGradient(0, top + mh, 0, top);
          grad.addColorStop(0, '#2fbf8a');
          grad.addColorStop(norm(-12), '#9ad94a');
          grad.addColorStop(norm(-6), '#f0a53a');
          grad.addColorStop(norm(-1), '#ff4d4d');
          ctx.fillStyle = grad;
          const lh = level[ch] * mh;
          ctx.fillRect(x, top + mh - lh, bw, lh);
          if (hold[ch] > 0.01) {
            ctx.fillStyle = hold[ch] > norm(-1) ? '#ff4d4d' : '#e9eaec';
            ctx.fillRect(x, top + mh - hold[ch] * mh, bw, 1.5);
          }
        }
        ctx.fillStyle = '#5b5f68';
        ctx.font = '9px "JetBrains Mono Variable", monospace';
        ctx.fillText('dB', 7, 11);
        for (const db of [0, -6, -12, -24, -36]) {
          const y = top + mh - norm(db) * mh;
          ctx.fillRect(26, y, 3, 1);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="meters" title="Nivel de salida (pico). Mantén la voz entre −12 y −6 dB." />;
}
