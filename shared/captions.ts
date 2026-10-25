import type { AudioClip, CaptionSegment, MediaClip, Project, TranscriptFile, Word } from './types';
import { uid } from './id';

/** Proyecta las palabras transcritas de cada clip sobre la línea de tiempo. */
export function wordsOnTimeline(p: Project, transcripts: Record<string, TranscriptFile>): Word[] {
  const out: Word[] = [];
  const byAsset = new Map<string, (MediaClip | AudioClip)[]>();
  for (const c of p.clips) {
    if (c.type !== 'video' && c.type !== 'audio') continue;
    if (c.type === 'audio' && c.duck) continue; // la música no lleva subtítulos
    const tr = p.tracks.find((t) => t.id === c.trackId);
    if (!tr || tr.muted || c.volume <= 0) continue;
    if (!transcripts[c.assetId]) continue;
    if (!byAsset.has(c.assetId)) byAsset.set(c.assetId, []);
    byAsset.get(c.assetId)!.push(c);
  }
  for (const [assetId, clips] of byAsset) {
    const span = (c: MediaClip | AudioClip) => [c.in, c.in + c.duration * c.speed] as const;
    for (const w of transcripts[assetId].words) {
      const mid = (w.start + w.end) / 2;
      let c = clips.find((x) => mid >= span(x)[0] && mid <= span(x)[1]);
      let s = w.start;
      let e = w.end;
      if (!c) {
        // La palabra cae en un tramo cortado: pegarla al borde conservado más cercano (≤ 0,6 s)
        let best = Infinity;
        for (const x of clips) {
          const [a, b] = span(x);
          const d = mid < a ? a - mid : mid - b;
          if (d < best) {
            best = d;
            c = x;
          }
        }
        if (!c || best > 0.6) continue;
        const [a, b] = span(c);
        const len = Math.min(0.3, e - s, b - a);
        if (mid < a) {
          s = a;
          e = a + len;
        } else {
          e = b;
          s = b - len;
        }
      }
      const [a, b] = span(c);
      const start = c.start + (Math.max(s, a) - c.in) / c.speed;
      const end = c.start + (Math.min(e, b) - c.in) / c.speed;
      out.push({ start, end: Math.max(end, start + 0.05), text: w.text });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

const BREAK_AFTER = /[.,!?;:…]$/;

/** Agrupa palabras en frases cortas, cortando en pausas y signos de puntuación. */
export function buildSegments(words: Word[], maxWords: number, maxGap = 0.6): CaptionSegment[] {
  const segs: CaptionSegment[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    segs.push({
      id: uid('cap_'),
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      text: cur.map((w) => w.text).join(' '),
      words: cur,
    });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && (w.start - prev.end > maxGap || cur.length >= maxWords)) flush();
    cur.push({ ...w, text: w.text.trim() });
    if (BREAK_AFTER.test(w.text.trim()) && cur.length >= Math.min(2, maxWords)) flush();
  }
  flush();
  // Que cada frase dure hasta que empiece la siguiente si el hueco es pequeño.
  for (let i = 0; i < segs.length - 1; i++) {
    const gap = segs[i + 1].start - segs[i].end;
    if (gap > 0 && gap < 0.4) segs[i].end = segs[i + 1].start;
  }
  return segs;
}

export function activeSegment(p: Project, t: number): CaptionSegment | undefined {
  return p.captions.segments.find((s) => t >= s.start && t < s.end);
}
