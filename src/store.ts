import { create } from 'zustand';
import type { Asset, Project, TranscriptFile } from '../shared/types';
import { normalizeProject, projectDuration } from '../shared/ops';
import { api, type ExportJob, type ServerStatus } from './api';
import { mediaFileUrl } from './engine/media';

const HISTORY = 200;

export type Tool = 'select' | 'razor';
export type LeftTab = 'media' | 'templates' | 'effects' | 'captions';
export type RightTab = 'inspector' | 'ai';

interface Waveform {
  rate: number;
  peaks: number[];
}

interface EditorState {
  project: Project | null;
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
  toast: { text: string; kind: 'info' | 'error' } | null;

  load: (id: string) => Promise<void>;
  close: () => void;
  commit: (fn: (p: Project) => void) => void;
  beginTransient: () => void;
  transient: (fn: (p: Project) => void) => void;
  endTransient: () => void;
  replaceFromServer: (p: Project) => void;
  upsertAsset: (a: Asset) => void;
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

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let transientBase: Project | null = null;
let events: EventSource | null = null;
let raf = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleSave() {
  clearTimeout(saveTimer);
  useEditor.setState({ saving: 'pending' });
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
    }
  }, 500);
}

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
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
    });
    events = new EventSource(`/api/projects/${id}/events`);
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

  upsertAsset(a) {
    const p = get().project;
    if (!p) return;
    const exists = p.assets.some((x) => x.id === a.id);
    const assets = exists ? p.assets.map((x) => (x.id === a.id ? { ...x, ...a } : x)) : [...p.assets, a];
    // Los cambios de medios no entran en el historial de deshacer
    const patch = (q: Project) => ({ ...q, assets: q.assets.some((x) => x.id === a.id) ? q.assets.map((x) => (x.id === a.id ? { ...x, ...a } : x)) : [...q.assets, a] });
    set({ project: { ...p, assets }, past: get().past.map(patch), future: get().future.map(patch) });
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
