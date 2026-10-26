// Geometría de un medio en el lienzo. La comparten el compositor (Stage) y el
// monitor (caja de transformación y tiradores de recorte) para que coincidan.

import type { Asset, Crop, FormatId, MediaClip } from '../../shared/types';
import { clamp, lerp } from './anim';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Rectángulo que ocupa el medio completo en el lienzo, antes de recortes y transformación. */
export function mediaRect(c: MediaClip, asset: Asset | undefined, format: FormatId, W: number, H: number, local: number): Rect {
  const sw = asset?.width || W;
  const sh = asset?.height || H;
  let fr = c.framing?.[format] ?? { x: 0.5, y: 0.5, zoom: 1 };
  const face = c.autoReframe && asset?.faceTrack ? faceAt(asset.faceTrack, c.in + local * c.speed) : null;
  const kb = c.kenBurns ? lerp(1, 1.12, clamp(local / c.duration)) : 1;
  const zoom = Math.max(0.1, fr.zoom * kb);
  const s = (c.fit === 'contain' ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh)) * zoom;
  const width = sw * s;
  const height = sh * s;
  // Auto Reframe: centrar la cara en horizontal y dejar los ojos hacia el tercio superior
  if (face) fr = { ...fr, x: face[0], y: Math.min(1, face[1] + (0.5 - 0.42) * (H / height)) };
  const left = width >= W ? clamp(W / 2 - fr.x * width, W - width, 0) : (W - width) / 2;
  const top = height >= H ? clamp(H / 2 - fr.y * height, H - height, 0) : (H - height) / 2;
  return { left, top, width, height };
}

/** Parte visible tras recortar: el recorte es una fracción del propio medio en cada lado. */
export function cropRect(m: Rect, crop: Crop | undefined, W: number, H: number): Rect {
  const cr = crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const x0 = Math.max(0, m.left + cr.l * m.width);
  const y0 = Math.max(0, m.top + cr.t * m.height);
  const x1 = Math.min(W, m.left + m.width * (1 - cr.r));
  const y1 = Math.min(H, m.top + m.height * (1 - cr.b));
  return { left: x0, top: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** Recorte efectivo por lado (incluye lo que ya queda fuera del lienzo), en fracción del medio. */
export function effectiveCrop(m: Rect, crop: Crop | undefined, W: number, H: number): Crop {
  const v = cropRect(m, crop, W, H);
  return {
    l: (v.left - m.left) / m.width,
    t: (v.top - m.top) / m.height,
    r: (m.left + m.width - (v.left + v.width)) / m.width,
    b: (m.top + m.height - (v.top + v.height)) / m.height,
  };
}

/** Posición de la cara interpolada en el segundo `t` de la fuente. */
export function faceAt(track: { rate: number; points: [number, number][] }, t: number): [number, number] | null {
  const pts = track.points;
  if (!pts.length) return null;
  const f = Math.max(0, Math.min(pts.length - 1, t * track.rate));
  const i = Math.floor(f);
  const a = pts[i];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  const k = f - i;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}
