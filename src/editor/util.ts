import type { Clip, Project } from '../../shared/types';
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
      const media = p.assets.filter((a) => a.type === 'video' || a.type === 'image');
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
export async function removeSilences(clipId: string, opts = { minSilence: 0.45, pad: 0.1 }) {
  const st = useEditor.getState();
  const p = st.project!;
  const c = p.clips.find((x) => x.id === clipId);
  if (!c || !isMedia(c)) return;
  const a = getAsset(p, c.assetId);
  if (!a) return;
  const tr = await st.ensureTranscript(a.id);
  let ranges: [number, number][];
  if (tr?.words.length) ranges = silencesFromWords(tr.words, a.duration, opts);
  else {
    const w = await st.ensureWaveform(a.id);
    if (!w) {
      st.notify('Este clip no tiene audio analizado todavía', 'error');
      return;
    }
    ranges = silencesFromPeaks(w.peaks, w.rate, opts);
  }
  let removed = 0;
  st.commit((d: Project) => {
    removed = removeSourceRanges(d, clipId, ranges);
  });
  st.notify(removed > 0 ? `Quitados ${removed.toFixed(1)} s de pausas (${ranges.length} cortes)` : 'No se encontraron pausas que quitar');
}
