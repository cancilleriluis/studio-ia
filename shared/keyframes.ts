// Fotogramas clave: evaluación e edición. Compartido por la previsualización,
// la exportación y la mezcla de audio.

import type { Clip, Keyframe, Keyframes, KfProp, Transform } from './types';

const SAME = 1 / 120;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function kfList(c: Clip, prop: KfProp): Keyframe[] | undefined {
  const k = (c as { keyframes?: Keyframes }).keyframes?.[prop];
  return k && k.length ? k : undefined;
}

export function isAnimated(c: Clip, prop: KfProp): boolean {
  return !!kfList(c, prop);
}

/** Valor de una propiedad en el instante local `t` (segundos desde el inicio del clip). */
export function kfValue(keys: Keyframe[] | undefined, t: number, base: number): number {
  if (!keys || !keys.length) return base;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      if (a.ease === 'hold') return a.v;
      const p = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      const e = a.ease === 'linear' ? p : easeInOut(p);
      return a.v + (b.v - a.v) * e;
    }
  }
  return last.v;
}

export function propAt(c: Clip, prop: KfProp, local: number, base: number): number {
  return kfValue(kfList(c, prop), local, base);
}

/** Transformación efectiva (con keyframes) en el instante local. */
export function transformAt(c: Clip & { transform: Transform }, local: number): Transform {
  const t = c.transform;
  if (!(c as { keyframes?: Keyframes }).keyframes) return t;
  return {
    x: propAt(c, 'x', local, t.x),
    y: propAt(c, 'y', local, t.y),
    scale: propAt(c, 'scale', local, t.scale),
    rotation: propAt(c, 'rotation', local, t.rotation),
    opacity: propAt(c, 'opacity', local, t.opacity),
  };
}

/** Crea o actualiza el fotograma clave de `prop` en el instante local `t`. */
export function setKey(c: Clip, prop: KfProp, t: number, v: number): void {
  const anyc = c as { keyframes?: Keyframes };
  anyc.keyframes ??= {};
  const list = (anyc.keyframes[prop] ??= []);
  const hit = list.find((k) => Math.abs(k.t - t) < SAME);
  if (hit) hit.v = v;
  else {
    list.push({ t, v, ease: 'ease' });
    list.sort((a, b) => a.t - b.t);
  }
}

export function removeKey(c: Clip, prop: KfProp, t: number): void {
  const anyc = c as { keyframes?: Keyframes };
  const list = anyc.keyframes?.[prop];
  if (!list) return;
  anyc.keyframes![prop] = list.filter((k) => Math.abs(k.t - t) >= SAME);
  if (!anyc.keyframes![prop]!.length) delete anyc.keyframes![prop];
}

export function clearKeys(c: Clip, prop: KfProp): void {
  const anyc = c as { keyframes?: Keyframes };
  if (anyc.keyframes) delete anyc.keyframes[prop];
}

export function hasKeyAt(c: Clip, prop: KfProp, t: number): boolean {
  return !!kfList(c, prop)?.some((k) => Math.abs(k.t - t) < SAME);
}

/** Instantes (locales) con algún fotograma clave, sin duplicados. */
export function keyTimes(c: Clip): number[] {
  const k = (c as { keyframes?: Keyframes }).keyframes;
  if (!k) return [];
  const all = Object.values(k).flatMap((l) => (l ?? []).map((x) => x.t));
  return [...new Set(all.map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b);
}

/** Desplaza todos los fotogramas clave (al recortar el inicio o partir un clip). */
export function shiftKeys(c: Clip, delta: number): void {
  const k = (c as { keyframes?: Keyframes }).keyframes;
  if (!k || !delta) return;
  for (const l of Object.values(k)) for (const x of l ?? []) x.t += delta;
}

/** Mueve los fotogramas clave que estén en `from` a `to` (en todas las propiedades). */
export function moveKeysAt(c: Clip, from: number, to: number): void {
  const k = (c as { keyframes?: Keyframes }).keyframes;
  if (!k) return;
  for (const l of Object.values(k)) {
    for (const x of l ?? []) if (Math.abs(x.t - from) < SAME * 2) x.t = to;
    l?.sort((a, b) => a.t - b.t);
  }
}
