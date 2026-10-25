import type { CaptionSegment, Project, TranscriptFile, Word } from './types';
import { uid } from './id';

/** Proyecta las palabras transcritas de cada clip sobre la línea de tiempo. */
export function wordsOnTimeline(p: Project, transcripts: Record<string, TranscriptFile>): Word[] {
  const out: Word[] = [];
  for (const c of p.clips) {
    if (c.type !== 'video' && c.type !== 'audio') continue;
    if (c.type === 'audio' && c.duck) continue; // la música no lleva subtítulos
    const tr = p.tracks.find((t) => t.id === c.trackId);
    if (!tr || tr.muted || c.volume <= 0) continue;
    const t = transcripts[c.assetId];
    if (!t) continue;
    const srcEnd = c.in + c.duration * c.speed;
    for (const w of t.words) {
      const mid = (w.start + w.end) / 2;
      if (mid < c.in || mid > srcEnd) continue;
      const start = c.start + (Math.max(w.start, c.in) - c.in) / c.speed;
      const end = c.start + (Math.min(w.end, srcEnd) - c.in) / c.speed;
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
