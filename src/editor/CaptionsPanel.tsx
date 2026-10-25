import { useState } from 'react';
import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import type { CaptionPreset, CaptionSegment, TranscriptFile } from '../../shared/types';
import { CAPTION_PRESETS, FONTS } from '../../shared/registry';
import { generateCaptions } from '../../shared/ops';
import { api } from '../api';
import { useEditor } from '../store';
import { formatTC } from './util';
import { ColorInput, NumberInput, Toggle } from './controls';

const PREVIEW: Record<CaptionPreset, React.CSSProperties> = {
  pop: { fontWeight: 900, textTransform: 'uppercase', WebkitTextStroke: '3px #000', paintOrder: 'stroke fill', fontSize: 15 },
  karaoke: { fontWeight: 800, fontSize: 14 },
  glass: { fontWeight: 650, background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.35)', borderRadius: 20, padding: '3px 10px', fontSize: 12 },
  clean: { fontWeight: 600, background: 'rgba(0,0,0,.7)', borderRadius: 4, padding: '3px 8px', fontSize: 12 },
  minimal: { fontWeight: 600, fontSize: 11, textShadow: '0 1px 4px #000' },
};

function retext(seg: CaptionSegment, text: string): CaptionSegment {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { ...seg, text: '', words: [] };
  if (tokens.length === seg.words.length) return { ...seg, text, words: seg.words.map((w, i) => ({ ...w, text: tokens[i] })) };
  const step = (seg.end - seg.start) / tokens.length;
  return { ...seg, text, words: tokens.map((t, i) => ({ text: t, start: seg.start + i * step, end: seg.start + (i + 1) * step })) };
}

export function CaptionsPanel() {
  const project = useEditor((s) => s.project)!;
  const time = useEditor((s) => s.time);
  const st = useEditor.getState();
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState('auto');
  const style = project.captions.style;
  const setStyle = (patch: Partial<typeof style>) => st.commit((p) => Object.assign(p.captions.style, patch));

  const generate = async () => {
    setBusy(true);
    try {
      const used = new Set(project.clips.filter((c) => c.type === 'video' || (c.type === 'audio' && !c.duck)).map((c) => (c as any).assetId));
      const assets = project.assets.filter((a) => used.has(a.id) && a.hasAudio && a.status === 'ready');
      if (!assets.length) {
        st.notify('No hay clips con voz en la línea de tiempo', 'error');
        return;
      }
      const missing = assets.filter((a) => a.transcriptStatus !== 'ready');
      if (missing.length) {
        if (!st.status?.whisper.model) {
          st.notify('Falta el modelo de Whisper: ejecuta "npm run setup:whisper"', 'error');
          return;
        }
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
      const transcripts: Record<string, TranscriptFile> = {};
      for (const a of assets) {
        const t = await useEditor.getState().ensureTranscript(a.id);
        if (t) transcripts[a.id] = t;
      }
      let n = 0;
      useEditor.getState().commit((p) => (n = generateCaptions(p, transcripts)));
      st.notify(`${n} subtítulos generados`);
    } catch (e: any) {
      st.notify(String(e.message), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-body">
      <div className="section">
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={generate} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            {project.captions.segments.length ? 'Regenerar subtítulos' : 'Generar subtítulos'}
          </button>
          <select value={lang} onChange={(e) => setLang(e.target.value)} title="Idioma del audio">
            <option value="auto">Auto</option>
            <option value="es">Español</option>
            <option value="en">Inglés</option>
            <option value="pt">Portugués</option>
            <option value="it">Italiano</option>
            <option value="fr">Francés</option>
          </select>
        </div>
        <div className="hint">Transcripción local con Whisper, palabra a palabra. Se adapta a los cortes que hagas: regenera tras editar.</div>
      </div>

      <div className="section">
        <div className="section-title">
          Estilo
          <Toggle value={project.captions.enabled} onChange={(v) => st.commit((p) => (p.captions.enabled = v))} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
          {CAPTION_PRESETS.map((c) => (
            <button
              key={c.id}
              className="panel-card"
              style={{
                margin: 0,
                textAlign: 'center',
                borderColor: style.preset === c.id ? 'var(--accent)' : undefined,
                background: 'linear-gradient(160deg,#2b3140,#14161b)',
                padding: '14px 6px 8px',
              }}
              title={c.description}
              onClick={() => setStyle({ preset: c.id, ...(c.id === 'pop' ? { uppercase: true } : c.id === 'clean' || c.id === 'minimal' ? { uppercase: false } : {}) })}
            >
              <span style={{ ...PREVIEW[c.id], color: '#fff', display: 'inline-block' }}>
                Hola <span style={{ color: c.id === 'clean' || c.id === 'minimal' ? '#fff' : style.highlight }}>mundo</span>
              </span>
              <div className="hint" style={{ marginTop: 8 }}>{c.name}</div>
            </button>
          ))}
        </div>
        <div className="field">
          <label>Fuente</label>
          <select value={style.font} onChange={(e) => setStyle({ font: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Tamaño</label>
          <NumberInput value={style.size} min={24} max={200} step={1} onChange={(v) => setStyle({ size: v })} />
        </div>
        <div className="field">
          <label>Altura</label>
          <NumberInput value={style.y} min={0.05} max={0.95} step={0.01} onChange={(v) => setStyle({ y: v })} />
        </div>
        <div className="field">
          <label>Color</label>
          <ColorInput value={style.color} onChange={(v) => setStyle({ color: v })} />
        </div>
        <div className="field">
          <label>Resaltado</label>
          <ColorInput value={style.highlight} onChange={(v) => setStyle({ highlight: v })} />
        </div>
        <div className="field">
          <label>Mayúsculas</label>
          <Toggle value={style.uppercase} onChange={(v) => setStyle({ uppercase: v })} />
        </div>
        <div className="field">
          <label>Palabras/frase</label>
          <NumberInput value={style.maxWords} min={1} max={12} step={1} onChange={(v) => setStyle({ maxWords: Math.round(v) })} />
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          Frases ({project.captions.segments.length})
          {project.captions.segments.length > 0 && (
            <button className="icon-btn sm" title="Borrar todos los subtítulos" onClick={() => st.commit((p) => (p.captions.segments = []))}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
        {project.captions.segments.length === 0 && <div className="empty">Genera los subtítulos para editarlos aquí.</div>}
        {project.captions.segments.map((s) => (
          <div key={s.id} className={`cap-list-item ${time >= s.start && time < s.end ? 'on' : ''}`}>
            <span className="tc" onClick={() => st.setTime(s.start + 0.01)}>{formatTC(s.start, project.fps).slice(0, 5)}</span>
            <input
              defaultValue={s.text}
              key={s.text}
              onBlur={(e) => {
                const v = e.target.value;
                if (v === s.text) return;
                st.commit((p) => {
                  const i = p.captions.segments.findIndex((x) => x.id === s.id);
                  if (i < 0) return;
                  if (!v.trim()) p.captions.segments.splice(i, 1);
                  else p.captions.segments[i] = retext(p.captions.segments[i], v);
                });
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
