import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  ChevronDown,
  ChevronRight,
  FileAudio,
  Folder,
  FolderInput,
  FolderMinus,
  FolderPlus,
  Image as ImageIcon,
  Loader2,
  Mic,
  MoreHorizontal,
  Palette,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
  Upload,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { Asset, MediaSort, Project } from '../../shared/types';
import { SOUND_EFFECTS } from '../../shared/registry';
import { uid } from '../../shared/id';
import { api } from '../api';
import { mediaFileUrl, assetUrl } from '../engine/media';
import { useEditor } from '../store';
import { DRAG_MIME } from './Timeline';
import { addAssetAt, formatSec } from './util';
import { openSource } from './SourceMonitor';

function Thumb({ projectId, asset }: { projectId: string; asset: Asset }) {
  if (asset.type === 'lut')
    return (
      <div className="asset-thumb" style={{ background: 'linear-gradient(135deg,#0f4c5c,#5f0f40,#e09f3e)', color: '#fff' }}>
        <Palette size={18} />
      </div>
    );
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

const SORTS: { value: MediaSort; label: string }[] = [
  { value: 'added', label: 'Orden de importación' },
  { value: 'recent', label: 'Más recientes primero' },
  { value: 'name', label: 'Nombre (A–Z)' },
  { value: 'type', label: 'Tipo' },
  { value: 'duration', label: 'Duración' },
];
const TYPE_ORDER: Record<string, number> = { video: 0, image: 1, audio: 2, lut: 3 };

function sortAssets(list: Asset[], sort: MediaSort): Asset[] {
  const out = [...list];
  if (sort === 'recent') out.reverse();
  else if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }));
  else if (sort === 'type') out.sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9));
  else if (sort === 'duration') out.sort((a, b) => b.duration - a.duration);
  return out;
}

/** Cuántos clips usan un medio (directamente, en paneles/props de plantillas o como LUT). */
function usesOf(p: Project, id: string): number {
  let n = 0;
  for (const c of p.clips) {
    if ('assetId' in c && c.assetId === id) n++;
    else if (c.type === 'template' && JSON.stringify(c.props).includes(`"${id}"`)) n++;
    else if ((c.type === 'video' || c.type === 'image') && c.grade?.lut === id) n++;
  }
  return n;
}

/** Quita un medio del panel y de la línea de tiempo (se puede deshacer con ⌘Z). */
function removeAsset(p: Project, id: string) {
  const a = p.assets.find((x) => x.id === id);
  if (!a) return;
  a.removed = true;
  delete a.folder;
  p.clips = p.clips.filter((c) => !('assetId' in c && c.assetId === id));
  for (const c of p.clips) {
    if (c.type === 'template') {
      for (const [k, v] of Object.entries(c.props)) {
        if (v === id) c.props[k] = '';
        else if (Array.isArray(v)) c.props[k] = v.map((it) => (it && typeof it === 'object' && it.assetId === id ? { ...it, assetId: '' } : it));
      }
    } else if ((c.type === 'video' || c.type === 'image') && c.grade?.lut === id) {
      delete c.grade.lut;
    }
  }
}

interface MenuItem {
  label: string;
  icon: LucideIcon;
  danger?: boolean;
  run: () => void;
}
interface MenuState {
  x: number;
  y: number;
  items: (MenuItem | '-')[];
}

function PopMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);
  const x = Math.min(menu.x, window.innerWidth - 250);
  const y = Math.min(menu.y, window.innerHeight - menu.items.length * 30 - 20);
  return (
    <div className="ctx-menu" style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()}>
      {menu.items.map((it, i) =>
        it === '-' ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <button
            key={i}
            className={`ctx-item ${it.danger ? 'danger' : ''}`}
            onClick={() => {
              it.run();
              onClose();
            }}
          >
            <it.icon size={14} />
            <span>{it.label}</span>
          </button>
        ),
      )}
    </div>
  );
}

/** Nombre editable en el sitio: Intro guarda, Esc cancela. */
function RenameInput({ value, onDone }: { value: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="rename-input"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onDone(v.trim() || null);
        if (e.key === 'Escape') onDone(null);
      }}
      onBlur={() => onDone(v.trim() || null)}
    />
  );
}

/** Zona donde soltar medios arrastrados desde el panel para moverlos a una carpeta. */
function useFolderDrop(folderId: string | undefined) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        try {
          const d = JSON.parse(e.dataTransfer.getData(DRAG_MIME));
          if (d.kind !== 'asset') return;
          e.preventDefault();
          e.stopPropagation();
          useEditor.getState().commit((p) => {
            const a = p.assets.find((x) => x.id === d.id);
            if (!a) return;
            if (folderId) a.folder = folderId;
            else delete a.folder;
          });
        } catch {
          /* no era un medio */
        }
      },
    },
  };
}

function AssetRow({ a, openMenu, renaming, setRenaming }: {
  a: Asset;
  openMenu: (e: React.MouseEvent, a: Asset) => void;
  renaming: boolean;
  setRenaming: (id: string | null) => void;
}) {
  const project = useEditor((s) => s.project)!;
  const st = useEditor.getState();
  const transcribe = async () => {
    if (!st.status?.whisper.model) {
      st.notify('Falta el modelo de Whisper: ejecuta "npm run setup:whisper"', 'error');
      return;
    }
    st.upsertAsset({ ...a, transcriptStatus: 'processing' });
    await api.transcribe(project.id, a.id).catch((e) => st.notify(String(e.message), 'error'));
  };
  return (
    <div
      className="asset"
      draggable={a.status === 'ready' && !renaming}
      onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'asset', id: a.id }))}
      onDoubleClick={() => a.type !== 'lut' && openSource(a.id)}
      onContextMenu={(e) => openMenu(e, a)}
      title="Doble clic: abrir en el monitor de origen · arrastra a una pista o a una carpeta · clic derecho: opciones"
    >
      <Thumb projectId={project.id} asset={a} />
      <div style={{ minWidth: 0 }}>
        {renaming ? (
          <RenameInput
            value={a.name}
            onDone={(v) => {
              setRenaming(null);
              if (v && v !== a.name) st.commit((p) => {
                const x = p.assets.find((y) => y.id === a.id);
                if (x) x.name = v;
              });
            }}
          />
        ) : (
          <div className="asset-name">{a.name}</div>
        )}
        <div className="asset-meta">
          {a.type === 'video' ? <Video size={11} /> : a.type === 'audio' ? <AudioLines size={11} /> : a.type === 'lut' ? <Palette size={11} /> : <ImageIcon size={11} />}
          {a.type === 'lut' && 'LUT de color · aplícala desde Color'}
          {a.type !== 'image' && a.type !== 'lut' && formatSec(a.duration)}
          {a.width ? ` · ${a.width}×${a.height}` : ''}
        </div>
        <div className="asset-meta">
          {a.status === 'processing' && <span className="pill busy">Procesando {Math.round((a.progress ?? 0) * 100)}%</span>}
          {a.status === 'error' && <span className="pill err" title={a.error}>Error</span>}
          {a.hasAudio && a.transcriptStatus === 'ready' && <span className="pill ok"><Mic size={10} /> Transcrito</span>}
          {a.hasAudio && a.transcriptStatus === 'processing' && <span className="pill busy"><Loader2 size={10} className="spin" /> Transcribiendo</span>}
          {a.hasAudio && a.transcriptStatus === 'error' && <span className="pill err">Error al transcribir</span>}
          {a.hasAudio && !a.sfx && a.status === 'ready' && (!a.transcriptStatus || a.transcriptStatus === 'none' || a.transcriptStatus === 'error') && (
            <button className="pill" onClick={transcribe} title="Transcribir con Whisper (local)">
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
      <div className="asset-actions">
        <button className="icon-btn sm" title="Opciones: renombrar, mover, eliminar" onClick={(e) => openMenu(e, a)}>
          <MoreHorizontal size={15} />
        </button>
        <button className="icon-btn sm" title="Añadir en el cabezal" disabled={a.status !== 'ready' || a.type === 'lut'} onClick={() => addAssetAt(a.id)}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

function FolderSection({ id, name, count, collapsed, toggle, renaming, setRenaming, openFolderMenu, children }: {
  id: string;
  name: string;
  count: number;
  collapsed: boolean;
  toggle: () => void;
  renaming: boolean;
  setRenaming: (id: string | null) => void;
  openFolderMenu: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const drop = useFolderDrop(id);
  const st = useEditor.getState();
  return (
    <div className={`media-folder ${drop.over ? 'over' : ''}`} {...drop.props}>
      <div className="media-folder-head" onClick={toggle} onContextMenu={openFolderMenu}>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <Folder size={14} />
        {renaming ? (
          <RenameInput
            value={name}
            onDone={(v) => {
              setRenaming(null);
              if (v && v !== name) st.commit((p) => {
                const f = p.mediaFolders?.find((x) => x.id === id);
                if (f) f.name = v;
              });
            }}
          />
        ) : (
          <span className="media-folder-name">{name}</span>
        )}
        <span className="media-folder-count">{count}</span>
        <button
          className="icon-btn sm"
          title="Opciones de la carpeta"
          onClick={(e) => {
            e.stopPropagation();
            openFolderMenu(e);
          }}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
      {!collapsed && (count ? <div className="media-folder-body">{children}</div> : <div className="hint media-folder-empty">Arrastra medios aquí</div>)}
    </div>
  );
}

/** Biblioteca de efectos de sonido: escuchar y añadir en el cabezal. */
function SoundEffects() {
  const project = useEditor((s) => s.project)!;
  const st = useEditor.getState();
  const [open, setOpen] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);

  const preview = (id: string, file: string) => {
    audio.current?.pause();
    if (playing === id) return setPlaying(null);
    const el = new Audio(`/api/sfx-files/${file}`);
    el.onended = () => setPlaying(null);
    el.play().catch(() => setPlaying(null));
    audio.current = el;
    setPlaying(id);
  };

  const add = async (id: string) => {
    setBusy(id);
    const at = st.time;
    try {
      const a = await api.addSfx(project.id, id);
      st.upsertAsset(a);
      // Esperar a que el servidor termine de procesarlo (forma de onda) antes de colocarlo
      for (let i = 0; i < 100; i++) {
        const cur = useEditor.getState().project?.assets.find((x) => x.id === a.id);
        if (cur?.status === 'ready') return addAssetAt(a.id, at);
        if (cur?.status === 'error') throw new Error(cur.error ?? 'No se pudo preparar el sonido');
        await new Promise((r) => setTimeout(r, 150));
      }
      throw new Error('El sonido tarda demasiado en prepararse');
    } catch (e: any) {
      st.notify(String(e.message), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="media-folder">
      <div className="media-folder-head" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <AudioLines size={14} />
        <span className="media-folder-name">Efectos de sonido</span>
        <span className="media-folder-count">{SOUND_EFFECTS.length}</span>
      </div>
      {open && (
        <div className="media-folder-body">
          {SOUND_EFFECTS.map((s) => (
            <div key={s.id} className="sfx-row" title={s.description}>
              <button className="icon-btn sm" title={playing === s.id ? 'Parar' : 'Escuchar'} onClick={() => preview(s.id, s.file)}>
                {playing === s.id ? <Square size={12} /> : <Play size={13} />}
              </button>
              <div style={{ minWidth: 0 }}>
                <div className="asset-name">{s.name}</div>
                <div className="asset-meta sfx-desc">{s.description}</div>
              </div>
              <button className="icon-btn sm" title="Añadir en el cabezal" disabled={busy === s.id} onClick={() => add(s.id)}>
                {busy === s.id ? <Loader2 size={14} className="spin" /> : <Plus size={15} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MediaPanel() {
  const project = useEditor((s) => s.project)!;
  const st = useEditor.getState();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [path, setPath] = useState('');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rootDrop = useFolderDrop(undefined);

  const folders = project.mediaFolders ?? [];
  const sort = project.mediaSort ?? 'added';
  const visible = sortAssets(project.assets.filter((a) => !a.removed), sort);
  const folderOf = (a: Asset) => (a.folder && folders.some((f) => f.id === a.folder) ? a.folder : undefined);
  const loose = visible.filter((a) => !folderOf(a));

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

  const newFolder = () => {
    const id = uid('f_');
    st.commit((p) => {
      p.mediaFolders = [...(p.mediaFolders ?? []), { id, name: 'Carpeta nueva' }];
    });
    setRenaming(id);
  };

  const at = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    return { x: e.clientX, y: e.clientY };
  };

  const openAssetMenu = (e: React.MouseEvent, a: Asset) => {
    const items: (MenuItem | '-')[] = [{ label: 'Renombrar', icon: Pencil, run: () => setRenaming(a.id) }];
    const current = folderOf(a);
    const targets = folders.filter((f) => f.id !== current);
    if (targets.length || current) items.push('-');
    for (const f of targets) {
      items.push({ label: `Mover a «${f.name}»`, icon: FolderInput, run: () => st.commit((p) => {
        const x = p.assets.find((y) => y.id === a.id);
        if (x) x.folder = f.id;
      }) });
    }
    if (current) {
      items.push({ label: 'Sacar de la carpeta', icon: FolderMinus, run: () => st.commit((p) => {
        const x = p.assets.find((y) => y.id === a.id);
        if (x) delete x.folder;
      }) });
    }
    items.push('-');
    items.push({
      label: 'Eliminar',
      icon: Trash2,
      danger: true,
      run: () => {
        const n = usesOf(project, a.id);
        if (n && !window.confirm(`«${a.name}» se usa en ${n} clip(s). Si lo eliminas, se quitarán sus clips de la línea de tiempo y se vaciará en las plantillas que lo usan.\n\nPuedes deshacerlo con ⌘Z.`)) return;
        st.commit((p) => removeAsset(p, a.id));
        st.select(st.selection.filter((id) => useEditor.getState().project!.clips.some((c) => c.id === id)));
        st.notify(`«${a.name}» eliminado · ⌘Z para deshacer`);
      },
    });
    setMenu({ ...at(e), items });
  };

  const openFolderMenu = (e: React.MouseEvent, id: string) => {
    setMenu({
      ...at(e),
      items: [
        { label: 'Renombrar carpeta', icon: Pencil, run: () => setRenaming(id) },
        {
          label: 'Eliminar carpeta (los medios se quedan)',
          icon: Trash2,
          danger: true,
          run: () => st.commit((p) => {
            p.mediaFolders = (p.mediaFolders ?? []).filter((f) => f.id !== id);
            for (const a of p.assets) if (a.folder === id) delete a.folder;
          }),
        },
      ],
    });
  };

  const row = (a: Asset) => <AssetRow key={a.id} a={a} openMenu={openAssetMenu} renaming={renaming === a.id} setRenaming={setRenaming} />;

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
        <input ref={input} type="file" multiple hidden accept="video/*,audio/*,image/*,.mov,.mkv,.heic,.cube" onChange={(e) => upload([...(e.target.files ?? [])])} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input placeholder="o pega una ruta: ~/Documents/video.mp4" value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && importPath()} style={{ flex: 1, fontSize: 12 }} />
        <button className="btn sm" onClick={importPath}>
          Añadir
        </button>
      </div>

      <div className="media-toolbar">
        <select value={sort} title="Ordenar medios" onChange={(e) => st.commit((p) => (p.mediaSort = e.target.value as MediaSort))}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="btn sm" onClick={newFolder} title="Nueva carpeta">
          <FolderPlus size={14} /> Carpeta
        </button>
      </div>

      <SoundEffects />

      {folders.map((f) => {
        const items = visible.filter((a) => folderOf(a) === f.id);
        return (
          <FolderSection
            key={f.id}
            id={f.id}
            name={f.name}
            count={items.length}
            collapsed={collapsed.has(f.id)}
            toggle={() => {
              const next = new Set(collapsed);
              next.has(f.id) ? next.delete(f.id) : next.add(f.id);
              setCollapsed(next);
            }}
            renaming={renaming === f.id}
            setRenaming={setRenaming}
            openFolderMenu={(e) => openFolderMenu(e, f.id)}
          >
            {items.map(row)}
          </FolderSection>
        );
      })}

      <div className={`media-loose ${rootDrop.over ? 'over' : ''}`} {...rootDrop.props}>
        {folders.length > 0 && loose.length > 0 && <div className="section-title" style={{ margin: '10px 0 4px' }}>Sin carpeta</div>}
        {visible.length === 0 && <div className="empty">Aún no hay medios. Importa tu vídeo para empezar.</div>}
        {loose.map(row)}
      </div>

      {menu && <PopMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
