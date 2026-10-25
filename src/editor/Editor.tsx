import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Captions as CaptionsIcon,
  Check,
  Clapperboard,
  CloudOff,
  Download,
  Film,
  Layers,
  Loader2,
  Redo2,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Wand2,
} from 'lucide-react';
import type { Clip } from '../../shared/types';
import { FORMATS, FORMAT_IDS } from '../../shared/formats';
import {
  clipEnd,
  cutRange,
  deleteClips,
  duplicateClip,
  getClip,
  projectDuration,
  setFormat,
  splitAt,
} from '../../shared/ops';
import { uid } from '../../shared/id';
import { useEditor } from '../store';
import { api } from '../api';
import { Monitor } from './Monitor';
import { Timeline } from './Timeline';
import { MediaPanel } from './MediaPanel';
import { TemplatesPanel } from './TemplatesPanel';
import { EffectsPanel } from './EffectsPanel';
import { CaptionsPanel } from './CaptionsPanel';
import { Inspector } from './Inspector';
import { AIPanel } from './AIPanel';
import { ExportDialog } from './ExportDialog';

let clipboard: Clip[] = [];

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const st = useEditor.getState();
      const p = st.project;
      if (!p) return;
      const mod = e.metaKey || e.ctrlKey;
      const fps = p.fps;
      const k = e.key.toLowerCase();

      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        st.redo();
        return;
      }
      if (mod && k === 'k') {
        e.preventDefault();
        st.commit((d) => splitAt(d, st.time, st.selection));
        return;
      }
      if (mod && k === 'd') {
        e.preventDefault();
        const ids: string[] = [];
        st.commit((d) => st.selection.forEach((id) => { const n = duplicateClip(d, id); if (n) ids.push(n); }));
        st.select(ids);
        return;
      }
      if (mod && k === 'c') {
        clipboard = p.clips.filter((c) => st.selection.includes(c.id)).map((c) => structuredClone(c));
        if (clipboard.length) st.notify(`${clipboard.length} clip(s) copiados`);
        return;
      }
      if (mod && k === 'v') {
        if (!clipboard.length) return;
        const base = Math.min(...clipboard.map((c) => c.start));
        const ids: string[] = [];
        st.commit((d) => {
          for (const c of clipboard) {
            const copy = structuredClone(c);
            copy.id = uid('c_');
            copy.start = st.time + (c.start - base);
            const free = !d.clips.some((o) => o.trackId === copy.trackId && o.start < clipEnd(copy) && clipEnd(o) > copy.start);
            if (!free) {
              const kind = copy.type === 'audio' ? 'audio' : 'visual';
              const t = d.tracks.find((tr) => tr.kind === kind && !d.clips.some((o) => o.trackId === tr.id && o.start < clipEnd(copy) && clipEnd(o) > copy.start));
              if (t) copy.trackId = t.id;
              else continue;
            }
            d.clips.push(copy);
            ids.push(copy.id);
          }
        });
        st.select(ids);
        return;
      }
      if (mod && k === 'a') {
        e.preventDefault();
        st.select(p.clips.map((c) => c.id));
        return;
      }
      if (mod) return;

      switch (k) {
        case ' ':
          e.preventDefault();
          st.toggle();
          break;
        case 'k':
          st.pause();
          break;
        case 'l':
          st.play();
          break;
        case 'j':
          st.setTime(st.time - 1);
          break;
        case 'arrowleft':
          e.preventDefault();
          st.pause();
          st.setTime(st.time - (e.shiftKey ? 1 : 1 / fps));
          break;
        case 'arrowright':
          e.preventDefault();
          st.pause();
          st.setTime(st.time + (e.shiftKey ? 1 : 1 / fps));
          break;
        case 'arrowup':
        case 'arrowdown': {
          e.preventDefault();
          const edges = [...new Set(p.clips.flatMap((c) => [c.start, clipEnd(c)]))].sort((a, b) => a - b);
          const t = k === 'arrowup' ? [...edges].reverse().find((x) => x < st.time - 1e-3) : edges.find((x) => x > st.time + 1e-3);
          if (t !== undefined) st.setTime(t);
          break;
        }
        case 'home':
          st.setTime(0);
          break;
        case 'end':
          st.setTime(projectDuration(p));
          break;
        case 's':
          st.commit((d) => splitAt(d, st.time, st.selection));
          break;
        case 'c':
          st.set({ tool: 'razor' });
          break;
        case 'v':
          st.set({ tool: 'select' });
          break;
        case 'backspace':
        case 'delete':
          if (st.selection.length) {
            e.preventDefault();
            st.commit((d) => deleteClips(d, st.selection, e.shiftKey));
            st.select([]);
          }
          break;
        case 'q':
        case 'w': {
          // Recorte con arrastre (ripple trim) al cabezal, como en Premiere
          const t = st.time;
          const under = p.clips
            .filter((c) => c.type === 'video' || c.type === 'audio' || c.type === 'image')
            .filter((c) => c.start < t - 1e-3 && clipEnd(c) > t + 1e-3)
            .sort((a, b) => {
              const ia = p.tracks.findIndex((x) => x.id === a.trackId);
              const ib = p.tracks.findIndex((x) => x.id === b.trackId);
              return ib - ia;
            });
          const c = st.selection.map((id) => getClip(p, id)).find((x) => x && x.start < t && clipEnd(x) > t) ?? under[0];
          if (!c) break;
          if (k === 'q') {
            st.commit((d) => cutRange(d, c.start, t));
            st.setTime(c.start);
          } else st.commit((d) => cutRange(d, t, clipEnd(c)));
          break;
        }
        case 'm':
          st.commit((d) => d.markers.push({ id: uid('m_'), time: st.time, label: `Marcador ${d.markers.length + 1}` }));
          break;
        case '=':
        case '+':
          st.set({ zoom: Math.min(800, st.zoom * 1.25) });
          break;
        case '-':
          st.set({ zoom: Math.max(4, st.zoom / 1.25) });
          break;
        case 'escape':
          st.select([]);
          st.set({ tool: 'select' });
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function SaveState() {
  const saving = useEditor((s) => s.saving);
  if (saving === 'error')
    return (
      <span className="save-state" style={{ color: 'var(--danger)' }}>
        <CloudOff size={13} /> Error al guardar
      </span>
    );
  if (saving === 'pending' || saving === 'saving')
    return (
      <span className="save-state">
        <Loader2 size={13} className="spin" /> Guardando…
      </span>
    );
  return (
    <span className="save-state">
      <Check size={13} /> Guardado
    </span>
  );
}

function TopBar() {
  const project = useEditor((s) => s.project)!;
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const st = useEditor.getState();
  const [name, setName] = useState(project.name);
  useEffect(() => setName(project.name), [project.name]);
  return (
    <div className="topbar">
      <button className="icon-btn" title="Proyectos" onClick={() => (location.hash = '#/')}>
        <ArrowLeft size={17} />
      </button>
      <div className="brand">
        <div className="brand-mark">
          <Clapperboard size={13} strokeWidth={2.6} />
        </div>
      </div>
      <input
        className="project-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== project.name && st.commit((p) => (p.name = name.trim()))}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <SaveState />
      <div style={{ width: 8 }} />
      <button className="icon-btn" title="Deshacer (⌘Z)" disabled={!canUndo} onClick={st.undo} style={{ opacity: canUndo ? 1 : 0.35 }}>
        <Undo2 size={16} />
      </button>
      <button className="icon-btn" title="Rehacer (⇧⌘Z)" disabled={!canRedo} onClick={st.redo} style={{ opacity: canRedo ? 1 : 0.35 }}>
        <Redo2 size={16} />
      </button>
      <div className="spacer" />
      <div className="seg" title="Formato del lienzo">
        {FORMAT_IDS.map((f) => (
          <button key={f} className={project.format === f ? 'on' : ''} onClick={() => st.commit((p) => setFormat(p, f))} title={FORMATS[f].hint}>
            {f}
          </button>
        ))}
      </div>
      <div className="spacer" />
      <button className="btn" onClick={() => st.set({ rightTab: 'ai' })}>
        <Sparkles size={14} color="var(--accent)" /> IA
      </button>
      <button className="btn primary" onClick={() => st.set({ exportOpen: true })}>
        <Download size={15} /> Exportar
      </button>
    </div>
  );
}

function LeftPanel() {
  const tab = useEditor((s) => s.leftTab);
  const set = useEditor((s) => s.set);
  const tabs = [
    { id: 'media', label: 'Medios', icon: Film },
    { id: 'templates', label: 'Plantillas', icon: Layers },
    { id: 'effects', label: 'Efectos', icon: Wand2 },
    { id: 'captions', label: 'Subtítulos', icon: CaptionsIcon },
  ] as const;
  return (
    <div className="panel left">
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => set({ leftTab: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'media' && <MediaPanel />}
      {tab === 'templates' && <TemplatesPanel />}
      {tab === 'effects' && <EffectsPanel />}
      {tab === 'captions' && <CaptionsPanel />}
    </div>
  );
}

function RightPanel() {
  const tab = useEditor((s) => s.rightTab);
  const set = useEditor((s) => s.set);
  return (
    <div className="panel right">
      <div className="tabs">
        <button className={tab === 'inspector' ? 'on' : ''} onClick={() => set({ rightTab: 'inspector' })}>
          <SlidersHorizontal size={13} /> Inspector
        </button>
        <button className={tab === 'ai' ? 'on' : ''} onClick={() => set({ rightTab: 'ai' })}>
          <Bot size={13} /> Asistente IA
        </button>
      </div>
      {tab === 'inspector' ? <Inspector /> : <AIPanel />}
    </div>
  );
}

function Toast() {
  const toast = useEditor((s) => s.toast);
  if (!toast) return null;
  return <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`}>{toast.text}</div>;
}

export function Editor({ projectId }: { projectId: string }) {
  const project = useEditor((s) => s.project);
  const exportOpen = useEditor((s) => s.exportOpen);
  const [error, setError] = useState('');
  const [tlH, setTlH] = useState(() => Number(localStorage.getItem('studio.tlh')) || 330);
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  useShortcuts();

  useEffect(() => {
    useEditor.getState().load(projectId).catch((e) => setError(String(e.message)));
    return () => useEditor.getState().close();
  }, [projectId]);

  // Soltar ficheros desde el Finder en cualquier parte del editor
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = async (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      const files = [...e.dataTransfer.files];
      const st = useEditor.getState();
      st.notify(`Importando ${files.length} archivo(s)…`);
      try {
        const assets = await api.upload(projectId, files);
        assets.forEach((a) => st.upsertAsset(a));
        st.set({ leftTab: 'media' });
      } catch (err: any) {
        st.notify(String(err.message), 'error');
      }
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [projectId]);

  if (error)
    return (
      <div className="empty" style={{ paddingTop: 120 }}>
        No se pudo abrir el proyecto: {error}
        <div style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => (location.hash = '#/')}>
            Volver
          </button>
        </div>
      </div>
    );
  if (!project) return <div className="empty" style={{ paddingTop: 120 }}>Cargando…</div>;

  return (
    <div className="editor" style={{ ['--tl-h' as any]: `${tlH}px` }}>
      <TopBar />
      <div className="workspace">
        <LeftPanel />
        <Monitor />
        <RightPanel />
      </div>
      <div
        className="resizer"
        onPointerDown={(e) => {
          dragRef.current = { y: e.clientY, h: tlH };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          const h = Math.max(160, Math.min(window.innerHeight - 260, dragRef.current.h - (e.clientY - dragRef.current.y)));
          setTlH(h);
        }}
        onPointerUp={() => {
          dragRef.current = null;
          localStorage.setItem('studio.tlh', String(tlH));
        }}
      />
      <Timeline />
      {exportOpen && <ExportDialog />}
      <Toast />
    </div>
  );
}
