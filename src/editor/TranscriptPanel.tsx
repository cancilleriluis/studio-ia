// Edición basada en texto, como en Premiere: la transcripción de la secuencia es
// un documento; borrar palabras las quita del vídeo (en todas las pistas).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Eraser, Loader2, Mic, Repeat2, Search, Trash2 } from 'lucide-react';
import type { TranscriptFile, Word } from '../../shared/types';
import { wordsOnTimeline } from '../../shared/captions';
import { cutRange } from '../../shared/ops';
import { useEditor } from '../store';
import { formatTC, timelineTranscripts } from './util';

const FILLERS = new Set(['eh', 'ehh', 'ehm', 'em', 'emm', 'mm', 'mmm', 'hmm', 'um', 'umm', 'uh', 'uhh', 'er', 'erm', 'ah', 'ahh']);
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, '');

/** Agrupa palabras contiguas en tramos de la línea de tiempo para cortarlos de una vez. */
function rangesFor(words: Word[], idx: number[]): [number, number][] {
  const sorted = [...new Set(idx)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const i of sorted) {
    const w = words[i];
    const next = words[i + 1];
    // Incluir el hueco hasta la siguiente palabra si es corto, para no dejar restos
    const end = next && next.start - w.end < 0.25 ? next.start : w.end;
    const last = out[out.length - 1];
    if (last && w.start - last[1] < 0.05) last[1] = Math.max(last[1], end);
    else out.push([w.start, end]);
  }
  return out;
}

export function TranscriptPanel() {
  const project = useEditor((s) => s.project)!;
  const time = useEditor((s) => s.time);
  const transcriptsState = useEditor((s) => s.transcripts);
  const st = useEditor.getState();
  const [transcripts, setTranscripts] = useState<Record<string, TranscriptFile> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [query, setQuery] = useState('');
  const anchor = useRef<number | null>(null);
  const dragging = useRef(false);
  const moved = useRef(false);

  const assetsKey = project.assets.map((a) => `${a.id}:${a.transcriptStatus}`).join('|');
  useEffect(() => {
    timelineTranscripts(false)
      .then((t) => {
        setTranscripts(t);
        setError('');
      })
      .catch((e) => setError(String(e.message)));
  }, [assetsKey, project.clips.length, transcriptsState]);

  const words = useMemo(() => (transcripts ? wordsOnTimeline(project, transcripts) : []), [project, transcripts]);
  const selected = useMemo(() => {
    if (!sel) return new Set<number>();
    const [a, b] = sel[0] <= sel[1] ? sel : [sel[1], sel[0]];
    return new Set(Array.from({ length: b - a + 1 }, (_, k) => a + k));
  }, [sel]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as number[];
    const parts = q.split(/\s+/).map(norm);
    const out: number[] = [];
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (parts.every((p, k) => norm(words[i + k].text).startsWith(p))) for (let k = 0; k < parts.length; k++) out.push(i + k);
    }
    return out;
  }, [query, words]);
  const fillers = useMemo(() => words.map((w, i) => (FILLERS.has(norm(w.text)) ? i : -1)).filter((i) => i >= 0), [words]);
  const repeats = useMemo(
    () => words.map((w, i) => (i > 0 && norm(w.text) && norm(w.text) === norm(words[i - 1].text) ? i : -1)).filter((i) => i >= 0),
    [words],
  );

  // Párrafos: nuevo bloque tras una pausa larga o al cerrar frase con bastante texto
  const paragraphs = useMemo(() => {
    const out: number[][] = [];
    let cur: number[] = [];
    words.forEach((w, i) => {
      const prev = words[i - 1];
      if (prev && cur.length && (w.start - prev.end > 1.0 || (/[.!?]$/.test(prev.text) && cur.length > 28))) {
        out.push(cur);
        cur = [];
      }
      cur.push(i);
    });
    if (cur.length) out.push(cur);
    return out;
  }, [words]);

  const remove = (idx: number[], label: string) => {
    if (!idx.length) return;
    const ranges = rangesFor(words, idx);
    const total = ranges.reduce((s, [a, b]) => s + (b - a), 0);
    st.commit((p) => {
      for (const [a, b] of [...ranges].reverse()) cutRange(p, a, b);
    });
    setSel(null);
    st.setTime(Math.max(0, ranges[0][0] - 0.05));
    st.notify(`${label}: ${idx.length} palabra(s), ${total.toFixed(1)} s quitados`);
  };

  const transcribe = async () => {
    setBusy(true);
    try {
      setTranscripts(await timelineTranscripts(true));
      setError('');
    } catch (e: any) {
      setError(String(e.message));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const activeIdx = words.findIndex((w, i) => time >= w.start && (time < w.end || (words[i + 1] && time < words[i + 1].start)));
  const hasTranscripts = transcripts && Object.keys(transcripts).length > 0;

  return (
    <div
      className="panel-body transcript"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Backspace' || e.key === 'Delete') && selected.size) {
          e.preventDefault();
          e.stopPropagation();
          remove([...selected], 'Eliminado');
        }
        if (e.key === 'Escape') setSel(null);
      }}
    >
      {!hasTranscripts ? (
        <div className="empty">
          <Mic size={22} style={{ marginBottom: 8 }} />
          <div style={{ marginBottom: 12 }}>{error && !error.startsWith('No hay clips') ? error : 'Transcribe el vídeo para editarlo como un texto: borra frases y desaparecen del vídeo.'}</div>
          {error.startsWith('No hay clips') ? (
            <div className="hint">{error}</div>
          ) : (
            <button className="btn primary" onClick={transcribe} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <Mic size={14} />} Transcribir
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="tx-tools">
            <div className="tx-search">
              <Search size={13} />
              <input placeholder="Buscar en la transcripción" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && <span className="hint">{new Set(matches).size ? `${matches.length}` : '0'}</span>}
            </div>
            <div className="tx-actions">
              <button className="btn sm" disabled={!selected.size} onClick={() => remove([...selected], 'Eliminado')} title="También con ⌫">
                <Trash2 size={12} /> Eliminar
              </button>
              {matches.length > 0 && (
                <button className="btn sm" onClick={() => remove(matches, 'Coincidencias eliminadas')}>
                  <Trash2 size={12} /> Quitar «{query.trim()}»
                </button>
              )}
              <button className="btn sm" disabled={!fillers.length} onClick={() => remove(fillers, 'Muletillas')} title="eh, em, mm, um, uh…">
                <Eraser size={12} /> Muletillas ({fillers.length})
              </button>
              <button className="btn sm" disabled={!repeats.length} onClick={() => remove(repeats, 'Repeticiones')} title="Palabras repetidas seguidas (tartamudeos)">
                <Repeat2 size={12} /> Repetidas ({repeats.length})
              </button>
              <button
                className="btn sm ghost"
                title="Copiar texto"
                onClick={() => {
                  navigator.clipboard.writeText(paragraphs.map((p) => p.map((i) => words[i].text).join(' ')).join('\n\n'));
                  st.notify('Transcripción copiada');
                }}
              >
                <Copy size={12} />
              </button>
            </div>
            <div className="hint">Clic: ir a esa palabra · arrastra o ⇧ clic para seleccionar · ⌫ borra del vídeo</div>
          </div>
          <div className="tx-doc" onPointerLeave={() => (dragging.current = false)}>
            {paragraphs.map((p, pi) => (
              <p key={pi}>
                <span className="tx-tc" onClick={() => st.setTime(words[p[0]].start + 0.01)}>
                  {formatTC(words[p[0]].start, project.fps).slice(0, 5)}
                </span>
                {p.map((i) => {
                  const w = words[i];
                  const cls = [
                    'tx-w',
                    i === activeIdx ? 'now' : '',
                    selected.has(i) ? 'sel' : '',
                    matches.includes(i) ? 'match' : '',
                    FILLERS.has(norm(w.text)) ? 'filler' : '',
                  ].join(' ');
                  return (
                    <span
                      key={i}
                      className={cls}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        (e.currentTarget.closest('.transcript') as HTMLElement)?.focus();
                        moved.current = false;
                        if (e.shiftKey && anchor.current !== null) setSel([anchor.current, i]);
                        else {
                          anchor.current = i;
                          dragging.current = true;
                          setSel(null);
                        }
                      }}
                      onPointerEnter={() => {
                        if (dragging.current && anchor.current !== null) {
                          moved.current = true;
                          setSel([anchor.current, i]);
                        }
                      }}
                      onPointerUp={(e) => {
                        if (!moved.current && !e.shiftKey) st.setTime(w.start + 0.01);
                        dragging.current = false;
                      }}
                    >
                      {w.text}{' '}
                    </span>
                  );
                })}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
