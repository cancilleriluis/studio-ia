import type { CSSProperties } from 'react';
import type { AnimId } from '../../shared/types';

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Progreso 0..1 de t entre a y b. */
export const prog = (t: number, a: number, b: number) => (b === a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));

export const ease = {
  linear: (t: number) => t,
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

/** Visibilidad 0..1 de un elemento con entrada y salida. */
export function envelope(local: number, duration: number, inDur: number, outDur: number): { pin: number; pout: number } {
  const pin = inDur > 0 ? clamp(local / inDur) : 1;
  const pout = outDur > 0 ? clamp((local - (duration - outDur)) / outDur) : 0;
  return { pin, pout };
}

/**
 * Estilo de una animación de entrada/salida. `p` = 0 oculto, 1 visible.
 * `u` = unidad de escala del lienzo.
 */
export function animStyle(anim: AnimId, p: number, u: number, exiting = false): CSSProperties {
  if (anim === 'none' || p >= 1) return {};
  const e = exiting ? ease.inCubic(p) : ease.outCubic(p);
  const back = exiting ? e : ease.outBack(p);
  const d = 60 * u;
  switch (anim) {
    case 'fade':
      return { opacity: e };
    case 'slide-up':
      return { opacity: e, transform: `translateY(${(1 - e) * d}px)` };
    case 'slide-down':
      return { opacity: e, transform: `translateY(${-(1 - e) * d}px)` };
    case 'slide-left':
      return { opacity: e, transform: `translateX(${(1 - e) * d * 1.6}px)` };
    case 'slide-right':
      return { opacity: e, transform: `translateX(${-(1 - e) * d * 1.6}px)` };
    case 'pop':
      return { opacity: clamp(e * 1.6), transform: `scale(${lerp(0.6, 1, back)})` };
    case 'blur':
      return { opacity: e, filter: `blur(${(1 - e) * 24 * u}px)`, transform: `scale(${lerp(1.06, 1, e)})` };
    case 'zoom':
      return { opacity: e, transform: `scale(${lerp(exiting ? 1.25 : 0.75, 1, e)})` };
    case 'wipe':
      return exiting
        ? { clipPath: `inset(0 0 0 ${(1 - e) * 100}%)` }
        : { clipPath: `inset(0 ${(1 - e) * 100}% 0 0)` };
    default:
      return { opacity: e };
  }
}

export function mergeStyles(a: CSSProperties, b: CSSProperties): CSSProperties {
  const out: CSSProperties = { ...a, ...b };
  if (a.transform && b.transform) out.transform = `${a.transform} ${b.transform}`;
  if (a.filter && b.filter) out.filter = `${a.filter} ${b.filter}`;
  if (a.opacity !== undefined && b.opacity !== undefined) out.opacity = Number(a.opacity) * Number(b.opacity);
  return out;
}

/** Ruido determinista (para temblores, etc.). */
export function noise1(t: number, seed = 0): number {
  return Math.sin(t * 12.9898 + seed * 78.233) * 0.5 + Math.sin(t * 4.1 + seed) * 0.3 + Math.sin(t * 27.3 + seed * 3.1) * 0.2;
}
