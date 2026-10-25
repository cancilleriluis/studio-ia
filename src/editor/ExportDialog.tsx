import { useState } from 'react';
import { CheckCircle2, ClipboardCopy, Download, FolderOpen, Loader2, X, XCircle } from 'lucide-react';
import type { FormatId } from '../../shared/types';
import { FORMATS, FORMAT_IDS } from '../../shared/formats';
import { projectDuration } from '../../shared/ops';
import { api, type ExportJob } from '../api';
import { useEditor } from '../store';
import { formatSec } from './util';

interface Preset {
  name: string;
  hint: string;
  formats?: FormatId[];
  fps: number;
  quality: string;
  scale: number;
  codec: 'h264' | 'hevc';
}

const PRESETS: Preset[] = [
  { name: 'YouTube 1080p', hint: '16:9 · 1920×1080 · H.264', formats: ['16:9'], fps: 30, quality: 'high', scale: 1, codec: 'h264' },
  { name: 'YouTube 4K', hint: '16:9 · 3840×2160 · H.264', formats: ['16:9'], fps: 30, quality: 'high', scale: 2, codec: 'h264' },
  { name: 'Reels · TikTok · Shorts', hint: '9:16 · 1080×1920', formats: ['9:16'], fps: 30, quality: 'high', scale: 1, codec: 'h264' },
  { name: 'YouTube + Reels', hint: '16:9 y 9:16 a la vez', formats: ['16:9', '9:16'], fps: 30, quality: 'high', scale: 1, codec: 'h264' },
  { name: 'HEVC ligero', hint: 'Formato actual · ~40 % menos peso', fps: 30, quality: 'high', scale: 1, codec: 'hevc' },
  { name: 'Borrador rápido', hint: 'Mitad de resolución', fps: 30, quality: 'draft', scale: 0.5, codec: 'h264' },
];

function tc(t: number) {
  const s = Math.floor(t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const STATUS: Record<ExportJob['status'], string> = {
  queued: 'En cola',
  rendering: 'Renderizando fotogramas',
  audio: 'Mezclando audio',
  encoding: 'Codificando MP4',
  done: 'Listo',
  error: 'Error',
  cancelled: 'Cancelado',
};

function Ratio({ f }: { f: FormatId }) {
  const { width, height } = FORMATS[f];
  const s = 34 / Math.max(width, height);
  return <div className="ratio" style={{ width: width * s, height: height * s }} />;
}

export function ExportDialog() {
  const project = useEditor((s) => s.project)!;
  const jobs = useEditor((s) => s.jobs);
  const st = useEditor.getState();
  const [formats, setFormats] = useState<FormatId[]>([project.format]);
  const [fps, setFps] = useState(project.fps);
  const [quality, setQuality] = useState('high');
  const [normalize, setNormalize] = useState(true);
  const [scale, setScale] = useState(1);
  const [codec, setCodec] = useState<'h264' | 'hevc'>('h264');
  const inPoint = useEditor((s) => s.inPoint);
  const outPoint = useEditor((s) => s.outPoint);
  const hasRange = inPoint !== null && outPoint !== null && outPoint > inPoint;
  const [useRange, setUseRange] = useState(hasRange);
  const [busy, setBusy] = useState(false);
  const markers = [...project.markers].sort((a, b) => a.time - b.time);
  const chapters = markers.length
    ? (markers[0].time > 0.5 ? [{ time: 0, label: 'Intro' }, ...markers] : markers).map((m) => `${tc(m.time)} ${m.label}`).join('\n')
    : '';
  const applyPreset = (p: Preset) => {
    setFormats(p.formats ?? [project.format]);
    setFps(p.fps);
    setQuality(p.quality);
    setScale(p.scale);
    setCodec(p.codec);
  };
  const dur = projectDuration(project);
  const list = Object.values(jobs).filter((j) => j.projectId === project.id).sort((a, b) => b.startedAt - a.startedAt);

  const start = async () => {
    setBusy(true);
    try {
      const created = await api.export(project.id, {
        formats,
        fps,
        quality,
        normalize,
        scale,
        codec,
        range: useRange && hasRange ? [inPoint!, outPoint!] : undefined,
      });
      useEditor.setState({ jobs: { ...useEditor.getState().jobs, ...Object.fromEntries(created.map((j) => [j.id, j])) } });
    } catch (e: any) {
      st.notify(String(e.message), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && st.set({ exportOpen: false })}>
      <div className="modal">
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2>Exportar vídeo</h2>
            <div className="sub">
              MP4 H.264 · {formatSec(dur)} · se guarda en la carpeta <code>exports</code> del proyecto
            </div>
          </div>
          <button className="icon-btn" onClick={() => st.set({ exportOpen: false })}>
            <X size={16} />
          </button>
        </div>

        <div className="section-title">Preajustes</div>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button key={p.name} className="preset" onClick={() => applyPreset(p)}>
              <b>{p.name}</b>
              <span>{p.hint}</span>
            </button>
          ))}
        </div>

        <div className="section-title">Formatos (puedes elegir varios)</div>
        <div className="check-grid" style={{ marginBottom: 16 }}>
          {FORMAT_IDS.map((f) => (
            <div
              key={f}
              className={`check-card ${formats.includes(f) ? 'on' : ''}`}
              onClick={() => setFormats((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]))}
            >
              <Ratio f={f} />
              <div style={{ fontWeight: 700 }}>{f}</div>
              <div className="hint">{FORMATS[f].hint.split(' · ')[0]}</div>
            </div>
          ))}
        </div>
        {formats.some((f) => f !== project.format) && (
          <div className="hint" style={{ marginBottom: 12 }}>
            Los demás formatos usan el encuadre guardado para cada uno (cámbialo con el selector de formato de arriba).
          </div>
        )}

        <div className="field">
          <label>Fotogramas/s</label>
          <div className="seg">
            {[24, 25, 30, 60].map((f) => (
              <button key={f} className={fps === f ? 'on' : ''} onClick={() => setFps(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Calidad</label>
          <div className="seg">
            {[
              ['high', 'Alta'],
              ['standard', 'Estándar'],
              ['draft', 'Borrador'],
            ].map(([v, l]) => (
              <button key={v} className={quality === v ? 'on' : ''} onClick={() => setQuality(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Resolución</label>
          <div className="seg">
            {[
              [0.5, '½'],
              [1, '1080p'],
              [2, '4K'],
            ].map(([v, l]) => (
              <button key={v} className={scale === v ? 'on' : ''} onClick={() => setScale(v as number)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Códec</label>
          <div className="seg">
            <button className={codec === 'h264' ? 'on' : ''} onClick={() => setCodec('h264')}>
              H.264 (compatible)
            </button>
            <button className={codec === 'hevc' ? 'on' : ''} onClick={() => setCodec('hevc')}>
              HEVC (ligero)
            </button>
          </div>
        </div>
        {hasRange && (
          <div className="field">
            <label>Rango</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
              <input type="checkbox" checked={useRange} onChange={(e) => setUseRange(e.target.checked)} />
              Solo entre entrada y salida ({formatSec(outPoint! - inPoint!)})
            </label>
          </div>
        )}
        <div className="field">
          <label>Volumen</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
            <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />
            Normalizar a −14 LUFS (estándar de YouTube e Instagram)
          </label>
        </div>

        <button className="btn primary block" style={{ height: 38, marginTop: 8 }} disabled={!formats.length || busy || dur <= 0} onClick={start}>
          <Download size={15} /> Exportar {formats.length > 1 ? `${formats.length} versiones` : formats[0]}
        </button>

        {chapters && (
          <>
            <div className="section-title" style={{ marginTop: 20 }}>
              Capítulos para YouTube
              <button className="btn sm ghost" onClick={() => { navigator.clipboard.writeText(chapters); st.notify('Capítulos copiados'); }}>
                <ClipboardCopy size={12} /> Copiar
              </button>
            </div>
            <textarea readOnly value={chapters} rows={Math.min(8, chapters.split('\n').length)} style={{ width: '100%', fontFamily: 'JetBrains Mono Variable, monospace', fontSize: 12 }} />
            <div className="hint">Pégalos en la descripción. Salen de tus marcadores (M); YouTube pide al menos 3 y de 10 s o más.</div>
          </>
        )}

        {list.length > 0 && <div className="section-title" style={{ marginTop: 20 }}>Exportaciones</div>}
        {list.map((j) => (
          <div key={j.id} className="job">
            <div className="job-head">
              {j.status === 'done' ? (
                <CheckCircle2 size={15} color="var(--c-audio)" />
              ) : j.status === 'error' || j.status === 'cancelled' ? (
                <XCircle size={15} color="var(--danger)" />
              ) : (
                <Loader2 size={15} className="spin" />
              )}
              <b>{j.format}</b>
              <span className="hint">
                {STATUS[j.status]}
                {j.status === 'rendering' && j.fps ? ` · ${j.fps} fps` : ''}
                {j.finishedAt && j.status === 'done' ? ` · ${Math.round((j.finishedAt - j.startedAt) / 1000)} s` : ''}
              </span>
              <div className="spacer" />
              {j.status === 'done' && j.url && (
                <>
                  <a className="btn sm" href={j.url} download>
                    <Download size={12} /> Descargar
                  </a>
                  <button className="btn sm" onClick={() => j.file && api.reveal(j.file)}>
                    <FolderOpen size={12} /> Finder
                  </button>
                </>
              )}
              {['queued', 'rendering', 'audio', 'encoding'].includes(j.status) && (
                <button className="btn sm ghost" onClick={() => api.cancelJob(j.id)}>
                  Cancelar
                </button>
              )}
            </div>
            {j.status !== 'done' && j.status !== 'error' && j.status !== 'cancelled' && (
              <div className="progress">
                <div style={{ width: `${j.progress * 100}%` }} />
              </div>
            )}
            {j.error && <div className="hint" style={{ color: '#ffb4b4', marginTop: 6, userSelect: 'text' }}>{j.error}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
