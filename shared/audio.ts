// Cálculo de ganancia compartido entre la previsualización y la exportación,
// para que lo que se oye en el editor sea lo que sale en el MP4.

import type { AudioClip, MediaClip, Project } from './types';

export type AudibleClip = MediaClip | AudioClip;

export function fadeEnvelope(local: number, duration: number, fadeIn: number, fadeOut: number): number {
  let g = 1;
  if (fadeIn > 0 && local < fadeIn) g *= Math.max(0, local / fadeIn);
  if (fadeOut > 0 && local > duration - fadeOut) g *= Math.max(0, (duration - local) / fadeOut);
  return g;
}

export function isTrackAudible(p: Project, trackId: string): boolean {
  const tr = p.tracks.find((t) => t.id === trackId);
  return !!tr && !tr.muted;
}

/** Clips que producen sonido (vídeo con audio y clips de audio en pistas no silenciadas). */
export function audibleClips(p: Project): AudibleClip[] {
  return p.clips.filter((c): c is AudibleClip => {
    if (c.type !== 'video' && c.type !== 'audio') return false;
    if (c.volume <= 0 || !isTrackAudible(p, c.trackId)) return false;
    const a = p.assets.find((x) => x.id === c.assetId);
    return !!a && a.hasAudio;
  });
}

/** Tramos de la línea de tiempo donde hay voz (clips que no son música atenuable). */
export function voiceRegions(p: Project): [number, number][] {
  const ranges = audibleClips(p)
    .filter((c) => !(c.type === 'audio' && c.duck))
    .map((c) => [c.start, c.start + c.duration] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 0.35) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

export function duckFactor(regions: [number, number][], t: number, level: number, ramp = 0.35): number {
  let g = 1;
  for (const [a, b] of regions) {
    if (t < a - ramp || t > b + ramp) continue;
    let k: number;
    if (t < a) k = (a - t) / ramp;
    else if (t > b) k = (t - b) / ramp;
    else k = 0;
    g = Math.min(g, level + (1 - level) * k);
  }
  return g;
}

/** Ganancia final de un clip en el instante t de la línea de tiempo. */
export function clipGainAt(p: Project, clip: AudibleClip, t: number, regions?: [number, number][]): number {
  const local = t - clip.start;
  if (local < 0 || local > clip.duration) return 0;
  let g = clip.volume * fadeEnvelope(local, clip.duration, clip.fadeIn, clip.fadeOut) * (p.audio?.master ?? 1);
  if (clip.type === 'audio' && clip.duck) {
    g *= duckFactor(regions ?? voiceRegions(p), t, p.audio?.duckLevel ?? 0.22);
  }
  return g;
}
