// Operaciones de edición. Todas mutan el borrador `p` que reciben; quien llama
// se encarga de clonar el proyecto (historial de deshacer) y de guardarlo.
// Las usan tanto la interfaz como las herramientas de la IA.

import type {
  Asset,
  AudioClip,
  Clip,
  EffectClip,
  FormatId,
  MediaClip,
  Project,
  TemplateClip,
  Track,
  TranscriptFile,
} from './types';
import { uid } from './id';
import { defaultsFor, getEffect, getTemplate } from './registry';
import { buildSegments, wordsOnTimeline } from './captions';
import { isVertical } from './formats';
import { shiftKeys } from './keyframes';

export const EPS = 1e-4;

export const clipEnd = (c: Clip) => c.start + c.duration;

export function isMedia(c: Clip): c is MediaClip | AudioClip {
  return c.type === 'video' || c.type === 'image' || c.type === 'audio';
}

export function newProject(name: string, format: FormatId = '9:16'): Project {
  return {
    version: 1,
    id: uid('p_'),
    name,
    fps: 30,
    format,
    background: '#000000',
    assets: [],
    tracks: [
      { id: 'v3', name: 'V3', kind: 'visual' },
      { id: 'v2', name: 'V2', kind: 'visual' },
      { id: 'v1', name: 'V1', kind: 'visual' },
      { id: 'a1', name: 'A1', kind: 'audio' },
      { id: 'a2', name: 'A2', kind: 'audio' },
    ],
    clips: [],
    captions: {
      enabled: true,
      style: {
        preset: 'pop',
        font: 'Inter Variable',
        size: 78,
        color: '#ffffff',
        highlight: '#d9f99d',
        y: isVertical(format) ? 0.7 : 0.82,
        uppercase: true,
        maxWords: isVertical(format) ? 3 : 6,
      },
      segments: [],
    },
    audio: { duckLevel: 0.22, master: 1 },
    markers: [],
    updatedAt: Date.now(),
  };
}

/** Completa campos que falten en proyectos antiguos o editados a mano. */
export function normalizeProject(p: Project): Project {
  const base = newProject(p.name ?? 'Proyecto', p.format ?? '9:16');
  p.version = 1;
  p.fps ??= 30;
  p.background ??= '#000000';
  p.assets ??= [];
  p.tracks ??= base.tracks;
  p.clips ??= [];
  p.markers ??= [];
  p.audio = { ...base.audio, ...(p.audio ?? {}) };
  p.captions = {
    ...base.captions,
    ...(p.captions ?? {}),
    style: { ...base.captions.style, ...(p.captions?.style ?? {}) },
    segments: p.captions?.segments ?? [],
  };
  for (const c of p.clips) {
    if (c.type === 'video' || c.type === 'image') {
      c.in ??= 0;
      c.speed ??= 1;
      c.volume ??= c.type === 'video' ? 1 : 0;
      c.fadeIn ??= 0;
      c.fadeOut ??= 0;
      c.fit ??= 'cover';
      c.framing ??= {};
      c.transform = { ...defaultTransform(), ...(c.transform ?? {}) };
    } else if (c.type === 'audio') {
      c.in ??= 0;
      c.speed ??= 1;
      c.volume ??= 1;
      c.fadeIn ??= 0;
      c.fadeOut ??= 0;
      c.duck ??= false;
    } else if (c.type === 'template') {
      const def = getTemplate(c.template);
      c.props = { ...(def ? defaultsFor(def.fields) : {}), ...(c.props ?? {}) };
      c.transform = { ...defaultTransform(), ...(c.transform ?? {}) };
      c.animIn ??= def?.animIn ?? 'fade';
      c.animOut ??= def?.animOut ?? 'fade';
      c.inDuration ??= 0.5;
      c.outDuration ??= 0.4;
    } else if (c.type === 'effect') {
      const def = getEffect(c.effect);
      c.props = { ...(def ? defaultsFor(def.fields) : {}), ...(c.props ?? {}) };
    }
  }
  return p;
}

export function defaultTransform() {
  return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
}

export function projectDuration(p: Project): number {
  let d = 0;
  for (const c of p.clips) d = Math.max(d, clipEnd(c));
  for (const s of p.captions.segments) d = Math.max(d, s.end);
  return d;
}

export function getClip(p: Project, id: string): Clip | undefined {
  return p.clips.find((c) => c.id === id);
}

export function getAsset(p: Project, id: string): Asset | undefined {
  return p.assets.find((a) => a.id === id);
}

export function trackOf(p: Project, id: string): Track | undefined {
  return p.tracks.find((t) => t.id === id);
}

export function clipsOnTrack(p: Project, trackId: string): Clip[] {
  return p.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
}

export function isFree(p: Project, trackId: string, start: number, duration: number, ignore: string[] = []): boolean {
  return !p.clips.some(
    (c) =>
      c.trackId === trackId &&
      !ignore.includes(c.id) &&
      c.start < start + duration - EPS &&
      clipEnd(c) > start + EPS,
  );
}

export function addTrack(p: Project, kind: 'visual' | 'audio'): Track {
  const n = p.tracks.filter((t) => t.kind === kind).length + 1;
  const prefix = kind === 'visual' ? 'V' : 'A';
  let id = `${prefix.toLowerCase()}${n}`;
  while (p.tracks.some((t) => t.id === id)) id = `${prefix.toLowerCase()}${n}_${uid()}`;
  const track: Track = { id, name: `${prefix}${n}`, kind };
  if (kind === 'visual') p.tracks.unshift(track);
  else p.tracks.push(track);
  return track;
}

/** Busca una pista libre del tipo indicado (de abajo arriba para visual) o crea una. */
export function findFreeTrack(
  p: Project,
  kind: 'visual' | 'audio',
  start: number,
  duration: number,
  prefer?: string,
  from: 'low' | 'high' = 'low',
): string {
  if (prefer) {
    const t = trackOf(p, prefer);
    if (t && t.kind === kind && !t.locked && isFree(p, prefer, start, duration)) return prefer;
  }
  const tracks = p.tracks.filter((t) => t.kind === kind && !t.locked);
  let candidates = kind === 'visual' ? [...tracks].reverse() : tracks;
  if (kind === 'visual' && !prefer) {
    // Nunca encima del vídeo principal (V1). Los efectos buscan desde abajo para
    // afectar solo al vídeo; los gráficos desde arriba para quedar por encima.
    candidates = candidates.slice(1);
    if (from === 'high') candidates.reverse();
  }
  for (const t of candidates) if (isFree(p, t.id, start, duration)) return t.id;
  return addTrack(p, kind).id;
}

export function mainVisualTrack(p: Project): string {
  const visual = p.tracks.filter((t) => t.kind === 'visual');
  return visual[visual.length - 1]?.id ?? addTrack(p, 'visual').id;
}

export function createMediaClip(p: Project, asset: Asset, start: number, trackId?: string): MediaClip | AudioClip {
  const duration = asset.type === 'image' ? 5 : asset.duration;
  if (asset.type === 'audio') {
    const clip: AudioClip = {
      id: uid('c_'),
      type: 'audio',
      trackId: findFreeTrack(p, 'audio', start, duration, trackId),
      start,
      duration,
      assetId: asset.id,
      in: 0,
      speed: 1,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      duck: duration > 20,
      name: asset.name,
    };
    p.clips.push(clip);
    return clip;
  }
  const clip: MediaClip = {
    id: uid('c_'),
    type: asset.type,
    trackId: findFreeTrack(p, 'visual', start, duration, trackId ?? mainVisualTrack(p)),
    start,
    duration,
    assetId: asset.id,
    in: 0,
    speed: 1,
    volume: asset.type === 'video' && asset.hasAudio ? 1 : 0,
    fadeIn: 0,
    fadeOut: 0,
    fit: 'cover',
    framing: {},
    transform: defaultTransform(),
    kenBurns: asset.type === 'image' ? false : undefined,
    name: asset.name,
  };
  p.clips.push(clip);
  return clip;
}

export function createTemplateClip(
  p: Project,
  templateId: string,
  start: number,
  props: Record<string, any> = {},
  trackId?: string,
  duration?: number,
): TemplateClip {
  const def = getTemplate(templateId);
  if (!def) throw new Error(`Plantilla desconocida: ${templateId}`);
  const dur = duration ?? def.defaultDuration;
  const clip: TemplateClip = {
    id: uid('c_'),
    type: 'template',
    template: templateId,
    trackId: findFreeTrack(p, 'visual', start, dur, trackId, 'high'),
    start,
    duration: dur,
    props: { ...defaultsFor(def.fields), ...props },
    transform: defaultTransform(),
    animIn: def.animIn,
    animOut: def.animOut,
    inDuration: 0.55,
    outDuration: 0.4,
    name: def.name,
  };
  p.clips.push(clip);
  return clip;
}

export function createEffectClip(
  p: Project,
  effectId: string,
  start: number,
  props: Record<string, any> = {},
  trackId?: string,
  duration?: number,
): EffectClip {
  const def = getEffect(effectId);
  if (!def) throw new Error(`Efecto desconocido: ${effectId}`);
  const dur = duration ?? def.defaultDuration;
  const clip: EffectClip = {
    id: uid('c_'),
    type: 'effect',
    effect: effectId,
    trackId: findFreeTrack(p, 'visual', start, dur, trackId),
    start,
    duration: dur,
    props: { ...defaultsFor(def.fields), ...props },
    name: def.name,
  };
  p.clips.push(clip);
  return clip;
}

/** Corta un clip en el instante t. Devuelve el id de la segunda mitad. */
export function splitClip(p: Project, id: string, t: number): string | null {
  const c = getClip(p, id);
  if (!c || t <= c.start + 0.02 || t >= clipEnd(c) - 0.02) return null;
  const right = structuredClone(c) as Clip;
  right.id = uid('c_');
  const leftDur = t - c.start;
  right.start = t;
  right.duration = c.duration - leftDur;
  c.duration = leftDur;
  shiftKeys(right, -leftDur);
  if (isMedia(c) && isMedia(right)) {
    right.in = c.in + leftDur * c.speed;
    c.fadeOut = 0;
    right.fadeIn = 0;
    if (right.type !== 'audio') delete (right as MediaClip).transitionIn;
  }
  if (c.type === 'template' && right.type === 'template') {
    c.animOut = 'none';
    right.animIn = 'none';
  }
  p.clips.push(right);
  return right.id;
}

/** Corta en t todos los clips de pistas no bloqueadas (o solo los indicados). */
export function splitAt(p: Project, t: number, onlyIds?: string[]): string[] {
  const created: string[] = [];
  for (const c of [...p.clips]) {
    if (onlyIds && onlyIds.length && !onlyIds.includes(c.id)) continue;
    if (trackOf(p, c.trackId)?.locked) continue;
    const r = splitClip(p, c.id, t);
    if (r) created.push(r);
  }
  return created;
}

export function deleteClips(p: Project, ids: string[], ripple = false): void {
  const removed = p.clips.filter((c) => ids.includes(c.id)).sort((a, b) => b.start - a.start);
  p.clips = p.clips.filter((c) => !ids.includes(c.id));
  if (!ripple) return;
  for (const r of removed) {
    // Solo cerrar el hueco si en el resto de pistas no hay nada solapando ese tramo.
    const blocked = p.clips.some(
      (c) => c.trackId !== r.trackId && c.start < clipEnd(r) - EPS && clipEnd(c) > r.start + EPS && !trackOf(p, c.trackId)?.locked,
    );
    if (blocked) {
      for (const c of p.clips) if (c.trackId === r.trackId && c.start >= clipEnd(r) - EPS) c.start -= r.duration;
    } else {
      shiftAfter(p, clipEnd(r), -r.duration);
    }
  }
}

function shiftAfter(p: Project, t: number, delta: number) {
  for (const c of p.clips) {
    if (trackOf(p, c.trackId)?.locked) continue;
    if (c.start >= t - EPS) c.start = Math.max(0, c.start + delta);
  }
  for (const s of p.captions.segments) {
    if (s.start >= t - EPS) {
      s.start += delta;
      s.end += delta;
      for (const w of s.words) {
        w.start += delta;
        w.end += delta;
      }
    }
  }
  for (const m of p.markers) if (m.time >= t - EPS) m.time += delta;
}

/**
 * Elimina un tramo de la línea de tiempo y desplaza todo lo posterior.
 * El vídeo y la voz pierden ese contenido; la música y los gráficos que lo
 * cruzan solo se acortan, para que sigan de forma continua.
 */
export function cutRange(p: Project, t0: number, t1: number): void {
  if (t1 - t0 < 0.01) return;
  const len = t1 - t0;
  const next: Clip[] = [];
  for (const c of p.clips) {
    if (trackOf(p, c.trackId)?.locked) {
      next.push(c);
      continue;
    }
    const a = c.start;
    const b = clipEnd(c);
    const continuous = c.type === 'template' || c.type === 'effect' || (c.type === 'audio' && c.duck);
    if (b <= t0 + EPS) {
      next.push(c);
    } else if (a >= t1 - EPS) {
      c.start -= len;
      next.push(c);
    } else if (a >= t0 - EPS && b <= t1 + EPS) {
      // Totalmente dentro del tramo
      if (continuous && c.type !== 'audio') {
        c.start = t0;
        next.push(c);
      }
    } else if (continuous) {
      // Cruza el tramo: acortar sin saltar contenido
      const overlap = Math.min(b, t1) - Math.max(a, t0);
      if (a < t0) c.duration -= overlap;
      else {
        c.start = t0;
        c.duration -= overlap;
      }
      next.push(c);
    } else if (a < t0 && b > t1) {
      // El tramo está dentro del clip: partir y quitar el centro
      const right = structuredClone(c) as Clip;
      right.id = uid('c_');
      const leftDur = t0 - a;
      right.start = t0;
      right.duration = b - t1;
      if (isMedia(c) && isMedia(right)) {
        right.in = c.in + (t1 - a) * c.speed;
        c.fadeOut = 0;
        right.fadeIn = 0;
        if (right.type !== 'audio') delete (right as MediaClip).transitionIn;
      }
      c.duration = leftDur;
      shiftKeys(right, -(t1 - a));
      next.push(c, right);
    } else if (a < t0) {
      c.duration = t0 - a;
      next.push(c);
    } else {
      // Empieza dentro del tramo y termina después
      const cut = t1 - a;
      if (isMedia(c)) c.in += cut * c.speed;
      shiftKeys(c, -cut);
      c.start = t0;
      c.duration -= cut;
      next.push(c);
    }
  }
  p.clips = next.filter((c) => c.duration > 0.02);
  // Subtítulos y marcadores
  const segs = [];
  for (const s of p.captions.segments) {
    s.words = s.words
      .filter((w) => !(w.start >= t0 - EPS && w.end <= t1 + EPS))
      .map((w) => (w.start >= t1 - EPS ? { ...w, start: w.start - len, end: w.end - len } : w));
    if (!s.words.length) continue;
    s.start = s.words[0].start;
    s.end = Math.max(s.words[s.words.length - 1].end, s.end >= t1 ? s.end - len : Math.min(s.end, t0));
    s.text = s.words.map((w) => w.text).join(' ');
    segs.push(s);
  }
  p.captions.segments = segs;
  p.markers = p.markers
    .filter((m) => !(m.time > t0 && m.time < t1))
    .map((m) => (m.time >= t1 ? { ...m, time: m.time - len } : m));
}

/** Convierte rangos de silencio (tiempo de la fuente) de un clip en cortes en la línea de tiempo. */
export function removeSourceRanges(p: Project, clipId: string, ranges: [number, number][]): number {
  const c = getClip(p, clipId);
  if (!c || !isMedia(c)) return 0;
  const srcEnd = c.in + c.duration * c.speed;
  const timeline: [number, number][] = [];
  for (const [a, b] of ranges) {
    const s = Math.max(a, c.in);
    const e = Math.min(b, srcEnd);
    if (e - s < 0.05) continue;
    timeline.push([c.start + (s - c.in) / c.speed, c.start + (e - c.in) / c.speed]);
  }
  timeline.sort((x, y) => y[0] - x[0]);
  let total = 0;
  for (const [a, b] of timeline) {
    cutRange(p, a, b);
    total += b - a;
  }
  return total;
}

export function moveClip(p: Project, id: string, start: number, trackId?: string): boolean {
  const c = getClip(p, id);
  if (!c) return false;
  const target = trackId ?? c.trackId;
  const tr = trackOf(p, target);
  if (!tr || tr.locked) return false;
  const wantKind = c.type === 'audio' ? 'audio' : 'visual';
  if (tr.kind !== wantKind) return false;
  start = Math.max(0, start);
  if (!isFree(p, target, start, c.duration, [id])) return false;
  c.start = start;
  c.trackId = target;
  return true;
}

export function maxSourceDuration(p: Project, c: Clip): number {
  if (!isMedia(c) || c.type === 'image') return Infinity;
  const a = getAsset(p, c.assetId);
  return a ? a.duration : Infinity;
}

export function trimClip(p: Project, id: string, edge: 'start' | 'end', t: number): void {
  const c = getClip(p, id);
  if (!c) return;
  const others = clipsOnTrack(p, c.trackId).filter((o) => o.id !== id);
  if (edge === 'end') {
    let end = Math.max(c.start + 0.1, t);
    const nextClip = others.find((o) => o.start >= clipEnd(c) - EPS);
    if (nextClip) end = Math.min(end, nextClip.start);
    if (isMedia(c) && c.type !== 'image') {
      const maxDur = (maxSourceDuration(p, c) - c.in) / c.speed;
      end = Math.min(end, c.start + maxDur);
    }
    c.duration = end - c.start;
  } else {
    let start = Math.min(clipEnd(c) - 0.1, t);
    const prev = [...others].reverse().find((o) => clipEnd(o) <= c.start + EPS);
    start = Math.max(start, prev ? clipEnd(prev) : 0);
    if (isMedia(c) && c.type !== 'image') start = Math.max(start, c.start - c.in / c.speed);
    const delta = start - c.start;
    if (isMedia(c)) c.in += delta * c.speed;
    shiftKeys(c, -delta);
    c.start = start;
    c.duration -= delta;
  }
}

export function duplicateClip(p: Project, id: string): string | null {
  const c = getClip(p, id);
  if (!c) return null;
  const copy = structuredClone(c) as Clip;
  copy.id = uid('c_');
  copy.start = clipEnd(c);
  const kind = c.type === 'audio' ? 'audio' : 'visual';
  copy.trackId = findFreeTrack(p, kind, copy.start, copy.duration, c.trackId);
  p.clips.push(copy);
  return copy.id;
}

export function generateCaptions(p: Project, transcripts: Record<string, TranscriptFile>): number {
  const words = wordsOnTimeline(p, transcripts);
  p.captions.segments = buildSegments(words, p.captions.style.maxWords);
  p.captions.enabled = true;
  return p.captions.segments.length;
}

export function setFormat(p: Project, format: FormatId): void {
  const wasVertical = isVertical(p.format);
  p.format = format;
  if (wasVertical !== isVertical(format)) {
    p.captions.style.y = isVertical(format) ? 0.7 : 0.82;
    p.captions.style.maxWords = isVertical(format) ? 3 : 6;
  }
}

/** Abre un hueco de `len` segundos en t en todas las pistas no bloqueadas (edición de inserción). */
export function insertGap(p: Project, t: number, len: number): void {
  for (const c of [...p.clips]) {
    if (trackOf(p, c.trackId)?.locked) continue;
    if (c.start < t - EPS && clipEnd(c) > t + EPS) splitClip(p, c.id, t);
  }
  shiftAfter(p, t, len);
}

/** Vacía el tramo [t0, t1] de una pista sin desplazar nada (sobrescritura). */
export function clearRange(p: Project, trackId: string, t0: number, t1: number): void {
  for (const c of [...p.clips]) {
    if (c.trackId !== trackId) continue;
    if (c.start < t0 - EPS && clipEnd(c) > t0 + EPS) splitClip(p, c.id, t0);
  }
  for (const c of [...p.clips]) {
    if (c.trackId !== trackId) continue;
    if (c.start < t1 - EPS && clipEnd(c) > t1 + EPS) splitClip(p, c.id, t1);
  }
  p.clips = p.clips.filter((c) => !(c.trackId === trackId && c.start >= t0 - EPS && clipEnd(c) <= t1 + EPS));
}

/** Levantar: quita el contenido entre t0 y t1 de las pistas no bloqueadas dejando el hueco. */
export function liftRange(p: Project, t0: number, t1: number): void {
  for (const tr of p.tracks) if (!tr.locked) clearRange(p, tr.id, t0, t1);
  p.captions.segments = p.captions.segments.filter((s) => s.end <= t0 + EPS || s.start >= t1 - EPS);
}

/** Coloca un tramo [srcIn, srcOut] de un medio en t, insertando o sobrescribiendo. */
export function placeSource(
  p: Project,
  asset: Asset,
  srcIn: number,
  srcOut: number,
  t: number,
  mode: 'insert' | 'overwrite',
  videoTrack: string,
  audioTrack: string,
): string {
  const len = Math.max(0.1, srcOut - srcIn);
  const trackId = asset.type === 'audio' ? audioTrack : videoTrack;
  const tr = trackOf(p, trackId);
  if (!tr || tr.locked) throw new Error('La pista destino está bloqueada o no existe');
  if (mode === 'insert') insertGap(p, t, len);
  else clearRange(p, trackId, t, t + len);
  const c = createMediaClip(p, asset, t, trackId);
  // createMediaClip puede elegir otra pista si no está libre; forzamos la destino
  c.trackId = trackId;
  c.in = srcIn;
  c.duration = len;
  return c.id;
}

/** Desvincular audio: pasa el sonido de un clip de vídeo a un clip de audio independiente. */
export function unlinkAudio(p: Project, clipId: string): string | null {
  const c = getClip(p, clipId);
  if (!c || c.type !== 'video' || c.volume <= 0) return null;
  const a = getAsset(p, c.assetId);
  if (!a?.hasAudio) return null;
  const audio: AudioClip = {
    id: uid('c_'),
    type: 'audio',
    trackId: findFreeTrack(p, 'audio', c.start, c.duration),
    start: c.start,
    duration: c.duration,
    assetId: c.assetId,
    in: c.in,
    speed: c.speed,
    volume: c.volume,
    fadeIn: c.fadeIn,
    fadeOut: c.fadeOut,
    duck: false,
    enhance: c.enhance,
    name: `${a.name} (audio)`,
  };
  if (c.keyframes?.volume) audio.keyframes = { volume: structuredClone(c.keyframes.volume) };
  p.clips.push(audio);
  c.volume = 0;
  if (c.keyframes) delete c.keyframes.volume;
  return audio.id;
}

/** Desplaza clips un número de segundos si el destino está libre. */
export function nudgeClips(p: Project, ids: string[], delta: number): void {
  const moving = p.clips.filter((c) => ids.includes(c.id));
  if (moving.some((c) => c.start + delta < -EPS || trackOf(p, c.trackId)?.locked)) return;
  const ok = moving.every((c) => isFree(p, c.trackId, c.start + delta, c.duration, ids));
  if (ok) for (const c of moving) c.start = Math.max(0, c.start + delta);
}
