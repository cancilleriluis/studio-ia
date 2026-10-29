import type { AudioClip, Clip, MediaClip, Project, TranscriptFile } from '../../shared/types';
import { api } from '../api';
import { assetUrl } from '../engine/media';
import {
  createEffectClip,
  createMediaClip,
  createTemplateClip,
  getAsset,
  isMedia,
  removeSourceRanges,
} from '../../shared/ops';
import { silencesFromPeaks, silencesFromWords } from '../../shared/silence';
import { useEditor } from '../store';

export function formatTC(t: number, fps = 30): string {
  const sign = t < 0 ? '-' : '';
  t = Math.abs(t);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t % 1) * fps + 1e-6);
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

export function formatSec(t: number): string {
  const m = Math.floor(t / 60);
  const s = t % 60;
  return m ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)} s`;
}

export const CLIP_COLORS: Record<Clip['type'], string> = {
  video: 'var(--c-video)',
  image: 'var(--c-image)',
  audio: 'var(--c-audio)',
  template: 'var(--c-template)',
  effect: 'var(--c-effect)',
};

export function addAssetAt(assetId: string, start?: number, trackId?: string) {
  const st = useEditor.getState();
  let created = '';
  st.commit((p) => {
    const a = getAsset(p, assetId);
    if (!a) return;
    created = createMediaClip(p, a, start ?? st.time, trackId).id;
  });
  if (created) st.select([created]);
}

export function addTemplateAt(templateId: string, start?: number, trackId?: string, props?: Record<string, any>) {
  const st = useEditor.getState();
  let created = '';
  st.commit((p) => {
    const filled = { ...(props ?? {}) };
    // Rellenar paneles con los medios del proyecto para que se vea algo al instante
    if (templateId === 'split-screen' || templateId === 'triptych') {
      const media = p.assets.filter((a) => (a.type === 'video' || a.type === 'image') && !a.removed);
      if (media.length) {
        const def = templateId === 'split-screen'
          ? [{ label: 'SCENE 2' }, { label: 'SCENE 3' }]
          : [{ badge: '480P', dot: false }, { badge: '480P', dot: false }, { badge: '480P', dot: true }];
        filled.panels = def.map((d, i) => ({ ...d, assetId: media[i % media.length].id, in: (i * 2) % Math.max(1, Math.floor(media[i % media.length].duration)) }));
      }
    }
    created = createTemplateClip(p, templateId, start ?? st.time, filled, trackId).id;
  });
  if (created) st.select([created]);
}

export function addEffectAt(effectId: string, start?: number, trackId?: string) {
  const st = useEditor.getState();
  let created = '';
  st.commit((p) => {
    created = createEffectClip(p, effectId, start ?? st.time, {}, trackId).id;
  });
  if (created) st.select([created]);
}

/** Quita silencios de un clip (transcripción si existe; si no, forma de onda). */
export async function removeSilences(clipId: string, opts = { minSilence: 0.3, pad: 0.08, sensitivity: 0.5 }) {
  const st = useEditor.getState();
  const p = st.project!;
  const c = p.clips.find((x) => x.id === clipId);
  if (!c || !isMedia(c)) return;
  const a = getAsset(p, c.assetId);
  if (!a) return;
  // La energía del audio es la referencia fiable; la transcripción solo si no hay forma de onda
  const w = await st.ensureWaveform(a.id);
  let ranges: [number, number][];
  if (w) ranges = silencesFromPeaks(w.peaks, w.rate, opts);
  else {
    const tr = await st.ensureTranscript(a.id);
    if (!tr?.words.length) {
      st.notify('Este clip no tiene audio analizado todavía', 'error');
      return;
    }
    ranges = silencesFromWords(tr.words, a.duration, opts);
  }
  let removed = 0;
  st.commit((d: Project) => {
    removed = removeSourceRanges(d, clipId, ranges);
  });
  st.notify(removed > 0 ? `Quitados ${removed.toFixed(1)} s de pausas (${ranges.length} cortes)` : 'No se encontraron pausas que quitar');
}

/**
 * Transcripciones de los medios con voz que hay en la línea de tiempo.
 * Con `transcribe`, lanza Whisper en los que falten y espera a que terminen.
 */
export async function timelineTranscripts(transcribe: boolean, lang = 'auto'): Promise<Record<string, TranscriptFile>> {
  const st = useEditor.getState();
  const project = st.project!;
  const used = new Set(
    project.clips.filter((c) => c.type === 'video' || (c.type === 'audio' && !c.duck)).map((c) => (c as MediaClip | AudioClip).assetId),
  );
  const assets = project.assets.filter((a) => used.has(a.id) && a.hasAudio && a.status === 'ready');
  if (!assets.length) throw new Error('No hay clips con voz en la línea de tiempo');
  const missing = assets.filter((a) => a.transcriptStatus !== 'ready');
  if (missing.length && transcribe) {
    if (!st.status?.whisper.model) throw new Error('Falta el modelo de Whisper: ejecuta "npm run setup:whisper"');
    st.notify(`Transcribiendo ${missing.length} medio(s) con Whisper…`);
    for (const a of missing) await api.transcribe(project.id, a.id, lang);
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 600));
      const cur = useEditor.getState().project!.assets.filter((a) => missing.some((m) => m.id === a.id));
      if (cur.some((a) => a.transcriptStatus === 'error')) throw new Error('Falló la transcripción');
      if (cur.every((a) => a.transcriptStatus === 'ready')) break;
    }
  }
  const out: Record<string, TranscriptFile> = {};
  for (const a of assets) {
    const t = await useEditor.getState().ensureTranscript(a.id);
    if (t) out[a.id] = t;
  }
  return out;
}

/**
 * Auto Reframe: analiza las caras de los vídeos (si hace falta) y activa el
 * seguimiento en los clips indicados (por defecto, todos los vídeos que rellenan el cuadro).
 */
export async function autoReframe(clipIds?: string[]): Promise<void> {
  const st = useEditor.getState();
  const p = st.project!;
  const clips = p.clips.filter(
    (c): c is MediaClip => c.type === 'video' && (clipIds ? clipIds.includes(c.id) : c.fit === 'cover'),
  );
  if (!clips.length) {
    st.notify('No hay clips de vídeo que reencuadrar', 'error');
    return;
  }
  const { analyzeFaces } = await import('../engine/faces');
  const assets = [...new Set(clips.map((c) => c.assetId))]
    .map((id) => useEditor.getState().project!.assets.find((a) => a.id === id)!)
    .filter((a) => a && !a.faceTrack);
  for (const [k, a] of assets.entries()) {
    const label = assets.length > 1 ? ` (${k + 1}/${assets.length})` : '';
    st.notify(`Analizando caras${label}… 0 %`);
    const track = await analyzeFaces(assetUrl(p.id, a), a.duration, (f) => st.notify(`Analizando caras${label}… ${Math.round(f * 100)} %`));
    const updated = await api.faceTrack(p.id, a.id, track);
    useEditor.getState().upsertAsset(updated, true);
  }
  useEditor.getState().commit((d) => {
    for (const c of d.clips) if (clips.some((x) => x.id === c.id) && c.type === 'video') c.autoReframe = true;
  });
  st.notify(`Auto Reframe activado en ${clips.length} clip(s): el encuadre sigue tu cara en todos los formatos`);
}
