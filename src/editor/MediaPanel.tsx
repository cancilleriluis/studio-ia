import { useRef, useState } from 'react';
import { AudioLines, FileAudio, Image as ImageIcon, Loader2, Mic, Plus, Upload, Video } from 'lucide-react';
import type { Asset } from '../../shared/types';
import { api } from '../api';
import { mediaFileUrl, assetUrl } from '../engine/media';
import { useEditor } from '../store';
import { DRAG_MIME } from './Timeline';
import { addAssetAt, formatSec } from './util';
import { openSource } from './SourceMonitor';

function Thumb({ projectId, asset }: { projectId: string; asset: Asset }) {
  if (asset.type === 'image')
    return <div className="asset-thumb" style={{ backgroundImage: `url("${assetUrl(projectId, asset)}")` }} />;
  if (asset.type === 'video' && asset.filmstrip) {
    const fs = asset.filmstrip;
    const h = 46;
    const w = (fs.tileW / fs.tileH) * h;
    const idx = Math.min(fs.count - 1, Math.floor(fs.count / 3));
    return (
      <div className="asset-thumb">
        <div
          style={{
            width: w,
            height: h,
            backgroundImage: `url("${mediaFileUrl(projectId, fs.file)}")`,
            backgroundSize: `${fs.cols * w}px auto`,
            backgroundPosition: `${-(idx % fs.cols) * w}px ${-Math.floor(idx / fs.cols) * h}px`,
          }}
        />
      </div>
    );
  }
  return (
    <div className="asset-thumb">
      {asset.type === 'audio' ? <FileAudio size={18} /> : asset.status === 'processing' ? <Loader2 size={18} className="spin" /> : <Video size={18} />}
    </div>
  );
}

export function MediaPanel() {
  const project = useEditor((s) => s.project)!;
  const st = useEditor.getState();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [path, setPath] = useState('');

  const upload = async (files: File[]) => {
    if (!files.length) return;
    st.notify(`Importando ${files.length} archivo(s)…`);
    try {
      const assets = await api.upload(project.id, files);
      assets.forEach((a) => st.upsertAsset(a));
    } catch (e: any) {
      st.notify(String(e.message), 'error');
    }
  };

  const importPath = async () => {
    if (!path.trim()) return;
    try {
      const a = await api.importPath(project.id, path.trim());
      st.upsertAsset(a);
      setPath('');
    } catch (e: any) {
      st.notify(String(e.message), 'error');
    }
  };

  const transcribe = async (a: Asset) => {
    if (!st.status?.whisper.model) {
      st.notify('Falta el modelo de Whisper: ejecuta "npm run setup:whisper"', 'error');
      return;
    }
    st.upsertAsset({ ...a, transcriptStatus: 'processing' });
    await api.transcribe(project.id, a.id).catch((e) => st.notify(String(e.message), 'error'));
  };

  return (
    <div className="panel-body">
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          upload([...e.dataTransfer.files]);
        }}
      >
        <Upload size={18} style={{ marginBottom: 6 }} />
        <div style={{ fontWeight: 600 }}>Importar medios</div>
        <div className="hint" style={{ marginTop: 3 }}>Vídeo, audio o imágenes · arrastra aquí o haz clic</div>
        <input ref={input} type="file" multiple hidden accept="video/*,audio/*,image/*,.mov,.mkv,.heic" onChange={(e) => upload([...(e.target.files ?? [])])} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <input placeholder="o pega una ruta: ~/Documents/video.mp4" value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && importPath()} style={{ flex: 1, fontSize: 12 }} />
        <button className="btn sm" onClick={importPath}>
          Añadir
        </button>
      </div>

      {project.assets.length === 0 && <div className="empty">Aún no hay medios. Importa tu vídeo para empezar.</div>}
      {project.assets.map((a) => (
        <div
          key={a.id}
          className="asset"
          draggable={a.status === 'ready'}
          onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'asset', id: a.id }))}
          onDoubleClick={() => openSource(a.id)}
          title="Doble clic: abrir en el monitor de origen · arrastra a una pista"
        >
          <Thumb projectId={project.id} asset={a} />
          <div style={{ minWidth: 0 }}>
            <div className="asset-name">{a.name}</div>
            <div className="asset-meta">
              {a.type === 'video' ? <Video size={11} /> : a.type === 'audio' ? <AudioLines size={11} /> : <ImageIcon size={11} />}
              {a.type !== 'image' && formatSec(a.duration)}
              {a.width ? ` · ${a.width}×${a.height}` : ''}
            </div>
            <div className="asset-meta">
              {a.status === 'processing' && <span className="pill busy">Procesando {Math.round((a.progress ?? 0) * 100)}%</span>}
              {a.status === 'error' && <span className="pill err" title={a.error}>Error</span>}
              {a.hasAudio && a.transcriptStatus === 'ready' && <span className="pill ok"><Mic size={10} /> Transcrito</span>}
              {a.hasAudio && a.transcriptStatus === 'processing' && <span className="pill busy"><Loader2 size={10} className="spin" /> Transcribiendo</span>}
              {a.hasAudio && a.transcriptStatus === 'error' && <span className="pill err">Error al transcribir</span>}
              {a.hasAudio && a.status === 'ready' && (!a.transcriptStatus || a.transcriptStatus === 'none' || a.transcriptStatus === 'error') && (
                <button className="pill" onClick={() => transcribe(a)} title="Transcribir con Whisper (local)">
                  <Mic size={10} /> Transcribir
                </button>
              )}
            </div>
            {a.status === 'processing' && (
              <div className="progress" style={{ marginTop: 5 }}>
                <div style={{ width: `${(a.progress ?? 0) * 100}%` }} />
              </div>
            )}
          </div>
          <button className="icon-btn sm" title="Añadir en el cabezal" disabled={a.status !== 'ready'} onClick={() => addAssetAt(a.id)}>
            <Plus size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
