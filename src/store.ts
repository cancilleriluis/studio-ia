import { create } from 'zustand';
import type { Asset, Project, TranscriptFile } from '../shared/types';
import { normalizeProject, projectDuration } from '../shared/ops';
import { api, type ExportJob, type ServerStatus } from './api';
import { mediaFileUrl } from './engine/media';
import { resumeAudio } from './engine/audioEngine';

const HISTORY = 200;

export type Tool = 'select' | 'razor';
export type LeftTab = 'media' | 'templates' | 'effects' | 'captions';
export type RightTab = 'inspector' | 'ai';

interface Waveform {
  rate: number;
  peaks: number[];
}

export interface SourceState {
  assetId: string;
  time: number;
  in: number | null;
  out: number | null;
}

interface EditorState {
  project: Project | null;
  monitorMode: 'program' | 'source';
  source: SourceState | null;
  /** Marcas de entrada/salida del programa (I/O). */
  inPoint: number | null;
  outPoint: number | null;
  /** Pistas destino para insertar/sobrescribir. */
  targetVideo: string;
  targetAudio: string;
  past: Project[];
  future: Project[];
  saving: 'idle' | 'pending' | 'saving' | 'error';
  time: number;
  playing: boolean;
  selection: string[];
  tool: Tool;
  zoom: number; // px por segundo
  snapping: boolean;
  safeZones: boolean;
  leftTab: LeftTab;
  rightTab: RightTab;
  status: ServerStatus | null;
  jobs: Record<string, ExportJob>;
  transcripts: Record<string, TranscriptFile>;
  waveforms: Record<string, Waveform>;
  exportOpen: boolean;
  ctxMenu: { x: number; y: number; clipId: string } | null;
  historyOpen: boolean;
  toast: { text: string; kind: 'info' | 'error' } | null;

  load: (id: string) => Promise<void>;
  close: () => void;
  commit: (fn: (p: Project) => void) => void;
  beginTransient: () => void;
  transient: (fn: (p: Project) => void) => void;
  endTransient: () => void;
  replaceFromServer: (p: Project) => void;
  upsertAsset: (a: Asset, force?: boolean) => void;
  undo: () => void;
  redo: () => void;
  setTime: (t: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  select: (ids: string[], additive?: boolean) => void;
  set: (partial: Partial<EditorState>) => void;
  notify: (text: string, kind?: 'info' | 'error') => void;
  ensureTranscript: (assetId: string) => Promise<TranscriptFile | null>;
  ensureWaveform: (assetId: string) => Promise<Waveform | null>;
}

/**
 * Combina el estado de un medio con una actualización. Las respuestas HTTP y los
 * eventos en vivo pueden llegar desordenados: un medio ya listo nunca vuelve a
 * «procesando» ni pierde progreso por un mensaje atrasado.
 */
function mergeAsset(prev: Asset | undefined, next: Asset, force = false): Asset {
  if (!prev || force) return { ...prev, ...next };
  if (prev.status !== 'processing' && next.status === 'processing') {
    const { status, progress, proxy, filmstrip, waveform, error, ...rest } = next;
    return { ...prev, ...rest, transcriptStatus: next.transcriptStatus ?? prev.transcriptStatus };
  }
  if (prev.status === 'processing' && next.status === 'processing') {
    return { ...prev, ...next, progress: Math.max(prev.progress ?? 0, next.progress ?? 0) };
  }
  return { ...prev, ...next };
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let transientBase: Project | null = null;
let events: EventSource | null = null;
let raf = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleSave(delay = 500) {
  clearTimeout(saveTimer);
  if (useEditor.getState().saving !== 'error') useEditor.setState({ saving: 'pending' });
  saveTimer = setTimeout(async () => {
    const p = useEditor.getState().project;
    if (!p) return;
    useEditor.setState({ saving: 'saving' });
    try {
      await api.save(p);
      if (useEditor.getState().saving === 'saving') useEditor.setState({ saving: 'idle' });
    } catch (e) {
      console.error(e);
      useEditor.setState({ saving: 'error' });
      // Si el servidor no responde, reintentar: lo editado se guarda en cuanto vuelva
      scheduleSave(3000);
    }
  }, delay);
}

// Avisar antes de cerrar o recargar la pestaña con cambios sin guardar
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (useEditor.getState().saving !== 'idle') e.preventDefault();
  });
}

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  monitorMode: 'program',
  source: null,
  inPoint: null,
  outPoint: null,
  targetVideo: 'v1',
  targetAudio: 'a1',
  past: [],
  future: [],
  saving: 'idle',
  time: 0,
  playing: false,
  selection: [],
  tool: 'select',
  zoom: 80,
  snapping: true,
  safeZones: false,
  leftTab: 'media',
  rightTab: 'inspector',
  status: null,
  jobs: {},
  transcripts: {},
  waveforms: {},
  exportOpen: false,
  ctxMenu: null,
  historyOpen: false,
  toast: null,

  async load(id) {
    get().close();
    const [project, status, jobs] = await Promise.all([api.project(id), api.status(), api.exports(id)]);
    set({
      project: normalizeProject(project),
      status,
      past: [],
      future: [],
      time: 0,
      selection: [],
      jobs: Object.fromEntries(jobs.map((j) => [j.id, j])),
      transcripts: {},
      waveforms: {},
      monitorMode: 'program',
      source: null,
      inPoint: null,
      outPoint: null,
      targetVideo: project.tracks.filter((t) => t.kind === 'visual').slice(-1)[0]?.id ?? 'v1',
      targetAudio: project.tracks.find((t) => t.kind === 'audio')?.id ?? 'a1',
    });
    events = new EventSource(`/api/projects/${id}/events`);
    // Si la conexión en vivo se corta (p. ej. reinicio del servidor), al volver se
    // resincronizan los medios con el disco para no perder ningún «listo».
    let opened = false;
    events.addEventListener('open', () => {
      if (opened)
        api
          .project(id)
          .then((fresh) => fresh.assets.forEach((a) => get().upsertAsset(a, true)))
          .catch(() => {});
      opened = true;
    });
    events.addEventListener('project', (e) => get().replaceFromServer(JSON.parse((e as MessageEvent).data)));
    events.addEventListener('asset', (e) => get().upsertAsset(JSON.parse((e as MessageEvent).data)));
    events.addEventListener('job', (e) => {
      const job: ExportJob = JSON.parse((e as MessageEvent).data);
      set({ jobs: { ...get().jobs, [job.id]: job } });
      if (job.status === 'done') get().notify('Exportación terminada');
      if (job.status === 'error') get().notify(`Error al exportar: ${job.error ?? ''}`, 'error');
    });
  },

  close() {
    events?.close();
    events = null;
    get().pause();
    set({ project: null });
  },

  commit(fn) {
    const cur = get().project;
    if (!cur) return;
    const draft = structuredClone(cur);
    fn(draft);
    draft.updatedAt = Date.now();
    set({ project: draft, past: [...get().past.slice(-HISTORY), cur], future: [] });
    scheduleSave();
  },

  beginTransient() {
    transientBase = get().project;
  },
  transient(fn) {
    if (!transientBase) return;
    const draft = structuredClone(transientBase);
    fn(draft);
    set({ project: draft });
  },
  endTransient() {
    if (!transientBase) return;
    const base = transientBase;
    transientBase = null;
    if (base === get().project) return;
    set({ past: [...get().past.slice(-HISTORY), base], future: [] });
    scheduleSave();
  },

  replaceFromServer(p) {
    const cur = get().project;
    if (!cur || cur.id !== p.id) return;
    clearTimeout(saveTimer);
    const next = normalizeProject(p);
    const ids = new Set(next.clips.map((c) => c.id));
    set({
      project: next,
      past: [...get().past.slice(-HISTORY), cur],
      future: [],
      selection: get().selection.filter((id) => ids.has(id)),
      saving: 'idle',
    });
    // Forzar la recarga de transcripciones que hayan cambiado
    const tr = { ...get().transcripts };
    for (const a of next.assets) if (a.transcriptStatus !== 'ready') delete tr[a.id];
    set({ transcripts: tr });
  },

  upsertAsset(a, force = false) {
    const p = get().project;
    if (!p) return;
    const merged = mergeAsset(p.assets.find((x) => x.id === a.id), a, force);
    // Los cambios de medios no entran en el historial de deshacer
    const patch = (q: Project) => ({
      ...q,
      assets: q.assets.some((x) => x.id === a.id) ? q.assets.map((x) => (x.id === a.id ? merged : x)) : [...q.assets, merged],
    });
    set({ project: patch(p), past: get().past.map(patch), future: get().future.map(patch) });
    if (a.transcriptStatus === 'ready') {
      const tr = { ...get().transcripts };
      delete tr[a.id];
      set({ transcripts: tr });
    }
  },

  undo() {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future] });
    scheduleSave();
  },
  redo() {
    const { past, project, future } = get();
    if (!future.length || !project) return;
    set({ project: future[0], future: future.slice(1), past: [...past, project] });
    scheduleSave();
  },

  setTime(t) {
    const p = get().project;
    const max = p ? Math.max(projectDuration(p), 0) : 0;
    set({ time: Math.max(0, Math.min(t, max)) });
  },

  play() {
    const p = get().project;
    if (!p || get().playing) return;
    const dur = projectDuration(p);
    if (get().time >= dur - 0.05) set({ time: 0 });
    resumeAudio();
    set({ playing: true });
    let last = performance.now();
    const tick = (now: number) => {
      if (!get().playing) return;
      const dt = (now - last) / 1000;
      last = now;
      const t = get().time + dt;
      const d = projectDuration(get().project!);
      if (t >= d) {
        set({ time: d, playing: false });
        return;
      }
      set({ time: t });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  },
  pause() {
    cancelAnimationFrame(raf);
    if (get().playing) set({ playing: false });
  },
  toggle() {
    if (get().playing) get().pause();
    else get().play();
  },

  select(ids, additive) {
    if (additive) {
      const cur = new Set(get().selection);
      for (const id of ids) {
        if (cur.has(id)) cur.delete(id);
        else cur.add(id);
      }
      set({ selection: [...cur] });
    } else set({ selection: ids });
  },

  set(partial) {
    set(partial);
  },

  notify(text, kind = 'info') {
    clearTimeout(toastTimer);
    set({ toast: { text, kind } });
    toastTimer = setTimeout(() => set({ toast: null }), kind === 'error' ? 7000 : 3500);
  },

  async ensureTranscript(assetId) {
    const have = get().transcripts[assetId];
    if (have) return have;
    const p = get().project;
    if (!p) return null;
    const a = p.assets.find((x) => x.id === assetId);
    if (!a?.transcript || a.transcriptStatus !== 'ready') return null;
    const t = await api.transcript(p.id, assetId);
    if (t) set({ transcripts: { ...get().transcripts, [assetId]: t } });
    return t;
  },

  async ensureWaveform(assetId) {
    const have = get().waveforms[assetId];
    if (have) return have;
    const p = get().project;
    const a = p?.assets.find((x) => x.id === assetId);
    if (!p || !a?.waveform) return null;
    const w = (await fetch(mediaFileUrl(p.id, a.waveform)).then((r) => r.json())) as Waveform;
    set({ waveforms: { ...get().waveforms, [assetId]: w } });
    return w;
  },
}));

/** Acceso rápido al proyecto (fuera de React). */
export const getProject = () => useEditor.getState().project!;

// Acceso de depuración desde la consola del navegador (solo en desarrollo)
if (import.meta.env.DEV) (window as any).__editor = useEditor;
