import { useEffect, useState } from 'react';
import { Bot, Clapperboard, Film, Mic, Plus, Sparkles } from 'lucide-react';
import type { FormatId } from '../shared/types';
import { FORMATS, FORMAT_IDS } from '../shared/formats';
import { api, type ProjectSummary, type ServerStatus } from './api';

function timeAgo(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function Home() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<FormatId>('9:16');
  const [error, setError] = useState('');

  useEffect(() => {
    api.projects().then(setProjects).catch((e) => setError(String(e.message)));
    api.status().then(setStatus).catch(() => {});
  }, []);

  const create = async () => {
    const p = await api.createProject(name.trim() || 'Proyecto sin título', format);
    location.hash = `#/p/${p.id}`;
  };

  return (
    <div className="home">
      <div className="home-inner">
        <div className="brand" style={{ fontSize: 16 }}>
          <div className="brand-mark">
            <Clapperboard size={13} strokeWidth={2.6} />
          </div>
          Studio IA
        </div>
        <h1>Tus proyectos</h1>
        <div className="lead">Edita, anima y exporta para YouTube, Reels y Shorts. Con IA integrada.</div>

        {status && (
          <div className="status-row">
            <span className={`pill ${status.ffmpeg ? 'ok' : 'err'}`}>
              <Film size={11} /> ffmpeg {status.ffmpeg ? 'listo' : 'no encontrado'}
            </span>
            <span className={`pill ${status.whisper.binary && status.whisper.model ? 'ok' : 'busy'}`} title={status.whisper.model ?? ''}>
              <Mic size={11} /> Subtítulos{' '}
              {status.whisper.binary && status.whisper.model
                ? `(${status.whisper.model.split('/').pop()?.replace('ggml-', '').replace('.bin', '')})`
                : 'sin modelo: npm run setup:whisper'}
            </span>
            <span className={`pill ${status.ai ? 'ok' : 'busy'}`}>
              <Bot size={11} /> Chat IA {status.ai ? 'activo' : 'sin API key (opcional)'}
            </span>
          </div>
        )}
        {error && <div className="pill err" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="proj-grid">
          <div className="new-card">
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={15} color="var(--accent)" /> Nuevo proyecto
            </div>
            <input placeholder="Nombre del proyecto" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
            <div className="seg" style={{ alignSelf: 'flex-start' }}>
              {FORMAT_IDS.map((f) => (
                <button key={f} className={f === format ? 'on' : ''} onClick={() => setFormat(f)} title={FORMATS[f].hint}>
                  {f}
                </button>
              ))}
            </div>
            <div className="hint">{FORMATS[format].hint} · {FORMATS[format].width}×{FORMATS[format].height}</div>
            <button className="btn primary" onClick={create}>
              <Plus size={15} /> Crear
            </button>
          </div>
          {projects?.map((p) => (
            <div key={p.id} className="proj-card" onClick={() => (location.hash = `#/p/${p.id}`)}>
              <div className="proj-thumb">
                {p.thumb && p.thumbInfo ? (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundImage: `url("${p.thumb}")`,
                      backgroundSize: `${(p.thumbInfo as any).cols * 100}% auto`,
                      backgroundPosition: '0 0',
                      filter: 'saturate(1.05)',
                    }}
                  />
                ) : (
                  <Film size={28} />
                )}
                <span className="pill" style={{ position: 'absolute', top: 8, right: 8 }}>
                  {p.format}
                </span>
              </div>
              <div className="proj-info">
                <div className="t">{p.name}</div>
                <div className="m">
                  {p.clips} clips · {timeAgo(p.updatedAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
