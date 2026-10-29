// Lectura/escritura de proyectos en disco y avisos en vivo (SSE) a la interfaz.
// Si alguien edita project.json a mano (o Claude Code), el editor lo recarga.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Response } from 'express';
import type { Asset, Project } from '../shared/types';
import { newProject, normalizeProject } from '../shared/ops';
import { PROJECTS_DIR } from './config';

export const projectDir = (id: string) => path.join(PROJECTS_DIR, id);
export const mediaDir = (id: string) => path.join(projectDir(id), 'media');

/**
 * Ruta absoluta de un fichero de medios del proyecto. Las rutas guardadas en
 * project.json no son de fiar: se rechaza cualquiera que salga de media/.
 */
export function mediaPath(id: string, rel: string): string {
  const dir = path.resolve(mediaDir(safeId(id)));
  const full = path.resolve(dir, String(rel ?? ''));
  if (!full.startsWith(dir + path.sep)) throw new Error('Ruta de medio no válida');
  return full;
}
export const exportsDir = (id: string) => path.join(projectDir(id), 'exports');
const projectFile = (id: string) => path.join(projectDir(id), 'project.json');

const lastHash = new Map<string, string>();
const clients = new Map<string, Set<Response>>();
const watchers = new Map<string, fs.FSWatcher>();

const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex');

export function safeId(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('id de proyecto no válido');
  return id;
}

export function listProjects() {
  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(projectFile(d.name)))
    .map((d) => {
      try {
        const p = JSON.parse(fs.readFileSync(projectFile(d.name), 'utf8')) as Project;
        const firstVideo = p.assets.find((a) => a.filmstrip);
        return {
          id: p.id,
          name: p.name,
          format: p.format,
          updatedAt: p.updatedAt,
          clips: p.clips.length,
          thumb: firstVideo?.filmstrip ? `/files/${p.id}/media/${firstVideo.filmstrip.file}` : null,
          thumbInfo: firstVideo?.filmstrip ?? null,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b!.updatedAt - a!.updatedAt);
}

export function loadProject(id: string): Project {
  const raw = fs.readFileSync(projectFile(safeId(id)), 'utf8');
  return normalizeProject(JSON.parse(raw));
}

function writeProject(p: Project) {
  const file = projectFile(p.id);
  const json = JSON.stringify(p, null, 2);
  lastHash.set(p.id, hash(json));
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, file);
}

export function createProject(name: string, format: Project['format']): Project {
  const p = newProject(name, format);
  fs.mkdirSync(mediaDir(p.id), { recursive: true });
  fs.mkdirSync(exportsDir(p.id), { recursive: true });
  writeProject(p);
  return p;
}

/** Campos de los medios que calcula el servidor y que la interfaz no debe pisar. */
const DERIVED: (keyof Asset)[] = [
  'proxy', 'duration', 'width', 'height', 'fps', 'hasAudio', 'waveform', 'filmstrip',
  'transcript', 'transcriptStatus', 'status', 'progress', 'error', 'file', 'type', 'faceTrack', 'hiresProxy',
];

/** Guardado desde la interfaz: respeta lo que el servidor ha calculado de los medios. */
export function saveFromClient(incoming: Project): Project {
  snapshot(incoming.id, 'auto');
  const current = loadProject(incoming.id);
  const byId = new Map(current.assets.map((a) => [a.id, a]));
  // Los medios solo los crea el servidor al importar: se descartan los desconocidos
  // y de los conocidos solo se acepta lo editable (p. ej. el nombre)
  incoming.assets = incoming.assets.filter((a) => byId.has(a.id)).map((a) => {
    const cur = byId.get(a.id)!;
    const merged: any = { ...a };
    for (const k of DERIVED) merged[k] = (cur as any)[k];
    return merged as Asset;
  });
  // Medios añadidos en el servidor mientras la interfaz tenía una copia antigua: no se pierden
  for (const a of current.assets) if (!incoming.assets.some((x) => x.id === a.id)) incoming.assets.push(a);
  incoming.updatedAt = Date.now();
  writeProject(normalizeProject(incoming));
  return incoming;
}

/** Modificación hecha por el servidor (procesado, IA...). Avisa a la interfaz. */
export function mutateProject(id: string, fn: (p: Project) => void, event: 'project' | 'silent' = 'project'): Project {
  const p = loadProject(id);
  fn(p);
  p.updatedAt = Date.now();
  writeProject(p);
  if (event === 'project') broadcast(id, 'project', p);
  return p;
}

export function updateAsset(id: string, assetId: string, patch: Partial<Asset>): Asset | undefined {
  let updated: Asset | undefined;
  const p = loadProject(id);
  const a = p.assets.find((x) => x.id === assetId);
  if (!a) return undefined;
  Object.assign(a, patch);
  updated = a;
  writeProject(p);
  broadcast(id, 'asset', a);
  return updated;
}

export function broadcast(id: string, event: string, data: unknown) {
  const set = clients.get(id);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
}

export function subscribe(id: string, res: Response) {
  safeId(id);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': ok\n\n');
  if (!clients.has(id)) clients.set(id, new Set());
  clients.get(id)!.add(res);
  watchProject(id);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  res.on('close', () => {
    clearInterval(ping);
    clients.get(id)?.delete(res);
  });
}

function watchProject(id: string) {
  if (watchers.has(id)) return;
  let timer: NodeJS.Timeout | undefined;
  const w = fs.watch(projectDir(id), (_ev, name) => {
    if (name !== 'project.json') return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const raw = fs.readFileSync(projectFile(id), 'utf8');
        const h = hash(raw);
        if (h === lastHash.get(id)) return;
        lastHash.set(id, h);
        const p = normalizeProject(JSON.parse(raw));
        console.log(`[studio] project.json de ${id} editado fuera del editor → recargando`);
        broadcast(id, 'project', p);
      } catch {
        // JSON a medio escribir: esperar al siguiente evento
      }
    }, 150);
  });
  watchers.set(id, w);
}

/* ───────── Historial de versiones ───────── */

const historyDir = (id: string) => path.join(projectDir(id), 'history');
const lastSnapshot = new Map<string, number>();
const SNAPSHOT_EVERY = 3 * 60 * 1000;
const KEEP = 80;

/** Guarda una copia del project.json actual. 'auto' respeta un intervalo mínimo. */
export function snapshot(id: string, reason: 'auto' | 'ia' | 'restaurar' = 'auto'): void {
  const file = projectFile(id);
  if (!fs.existsSync(file)) return;
  const now = Date.now();
  if (reason === 'auto' && now - (lastSnapshot.get(id) ?? 0) < SNAPSHOT_EVERY) return;
  lastSnapshot.set(id, now);
  const dir = historyDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(file, path.join(dir, `${now}_${reason}.json`));
  const all = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  for (const f of all.slice(0, Math.max(0, all.length - KEEP))) fs.rmSync(path.join(dir, f));
}

export function listHistory(id: string) {
  const dir = historyDir(safeId(id));
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+_\w+\.json$/.test(f))
    .sort()
    .reverse()
    .map((f) => {
      const [time, reason] = f.replace('.json', '').split('_');
      let clips = 0;
      let duration = 0;
      try {
        const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Project;
        clips = p.clips.length;
        duration = Math.max(0, ...p.clips.map((c) => c.start + c.duration));
      } catch {
        /* versión dañada */
      }
      return { file: f, time: Number(time), reason, clips, duration };
    });
}

export function restoreHistory(id: string, file: string): Project {
  if (!/^\d+_\w+\.json$/.test(file)) throw new Error('Versión no válida');
  const src = path.join(historyDir(safeId(id)), file);
  if (!fs.existsSync(src)) throw new Error('Versión no encontrada');
  snapshot(id, 'restaurar');
  const p = normalizeProject(JSON.parse(fs.readFileSync(src, 'utf8')));
  p.id = id;
  // Conservar los medios actuales (los derivados pueden haber cambiado desde entonces)
  const current = loadProject(id);
  const known = new Map(current.assets.map((a) => [a.id, a]));
  p.assets = p.assets.filter((a) => known.has(a.id)).map((a) => ({ ...known.get(a.id)!, name: a.name, folder: a.folder, removed: a.removed }));
  for (const a of current.assets) if (!p.assets.some((x) => x.id === a.id)) p.assets.push(a);
  p.updatedAt = Date.now();
  writeProject(p);
  broadcast(id, 'project', p);
  return p;
}
