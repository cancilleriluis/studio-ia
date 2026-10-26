import type { Grade } from './types';

export function defaultGrade(): Grade {
  return {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    temperature: 0,
    tint: 0,
    saturation: 1,
    vibrance: 0,
    lift: [0, 0],
    gamma: [0, 0],
    gain: [0, 0],
    fade: 0,
    lutAmount: 1,
  };
}

/** ¿Cambia algo la corrección respecto a la imagen original? */
export function isGradeActive(g?: Grade): boolean {
  if (!g) return false;
  const d = defaultGrade();
  return (
    !!g.lut ||
    (['exposure', 'contrast', 'highlights', 'shadows', 'temperature', 'tint', 'saturation', 'vibrance', 'fade'] as const).some(
      (k) => Math.abs((g[k] ?? d[k]) - d[k]) > 1e-4,
    ) ||
    [g.lift, g.gamma, g.gain].some((w) => (w?.[1] ?? 0) > 1e-4)
  );
}

export const GRADE_LOOKS: { id: string; name: string; swatch: string; grade: Partial<Grade> }[] = [
  { id: 'natural', name: 'Natural', swatch: 'linear-gradient(135deg,#8a8f98,#c9ccd2)', grade: {} },
  { id: 'warm', name: 'Cálido', swatch: 'linear-gradient(135deg,#c76b2b,#f3c27a)', grade: { temperature: 0.35, saturation: 1.1, contrast: 0.08 } },
  { id: 'cool', name: 'Frío', swatch: 'linear-gradient(135deg,#2b5fc7,#9cc8f3)', grade: { temperature: -0.35, saturation: 0.95, contrast: 0.08 } },
  { id: 'cine', name: 'Cine', swatch: 'linear-gradient(135deg,#0f4c5c,#e09f3e)', grade: { contrast: 0.22, saturation: 0.9, lift: [190, 0.35], gain: [32, 0.3], highlights: -0.15 } },
  { id: 'vivid', name: 'Vivo', swatch: 'linear-gradient(135deg,#e5383b,#ffd166,#06d6a0)', grade: { saturation: 1.3, vibrance: 0.35, contrast: 0.12 } },
  { id: 'film', name: 'Película', swatch: 'linear-gradient(135deg,#a68a64,#ede0d4)', grade: { fade: 0.35, saturation: 0.82, contrast: -0.08, temperature: 0.12 } },
  { id: 'bw', name: 'B/N', swatch: 'linear-gradient(135deg,#111,#eee)', grade: { saturation: 0, contrast: 0.2 } },
  { id: 'noir', name: 'Noir', swatch: 'linear-gradient(135deg,#000,#777)', grade: { saturation: 0, contrast: 0.45, exposure: -0.15, shadows: -0.25 } },
];
