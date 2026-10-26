import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import express from 'express';
import multer from 'multer';
import type { FormatId, Project } from '../shared/types';
import { FORMAT_IDS } from '../shared/formats';
import { CLIENT_URL, IS_PROD, PORT, PROJECTS_DIR, ROOT, findBinary } from './config';
import {
  createProject,
  listProjects,
  loadProject,
  mutateProject,
  projectDir,
  safeId,
  listHistory,
  restoreHistory,
  saveFromClient,
  snapshot,
  subscribe,
  updateAsset,
} from './store';
import { importFile, resolveImportPath, resumePendingAssets } from './media';
import { readTranscript, transcribeAsset, whisperStatus } from './transcribe';
import { cancelExport, jobs, renderFrame, startExport } from './render';
import { aiAvailable, chat, resetChat } from './ai';

process.on('unhandledRejection', (e) => console.error('[studio] error no capturado', e));
process.on('uncaughtException', (e) => console.error('[studio] excepción no capturada', e));

const app = express();

// Solo accesible desde este Mac: bloquea otras máquinas de la red, DNS rebinding
// y peticiones lanzadas por páginas web de otros orígenes.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
app.use((req, res, next) => {
  const host = req.headers.host ?? '';
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  const blocked =
    !LOCAL_HOST.test(host) ||
    // "null" lo envían iframes aislados y documentos locales: nunca es nuestra interfaz
    (origin !== undefined && !LOCAL_ORIGIN.test(origin)) ||
    // El navegador marca así las peticiones lanzadas desde otras webs (también <img>, <video>...)
    site === 'cross-site' ||
    site === 'same-site';
  if (blocked) {
    res.status(403).end('Solo se permiten peticiones locales');
    return;
  }
  next();
});
app.use(express.json({ limit: '50mb' }));

const upload = multer({ dest: path.join(os.tmpdir(), 'studio-uploads') });

const wrap =
  (fn: (req: express.Request, res: express.Response) => Promise<any> | any) =>
  async (req: express.Request, res: express.Response) => {
    try {
      const out = await fn(req, res);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (e: any) {
      console.error(e);
      if (!res.headersSent) res.status(400).json({ error: String(e?.message ?? e) });
    }
  };

const pid = (req: express.Request) => safeId(String(req.params.id));

app.get('/api/status', wrap(() => ({
  ffmpeg: !!findBinary('ffmpeg'),
  whisper: whisperStatus(),
  ai: aiAvailable(),
  projectsDir: PROJECTS_DIR,
  clientUrl: CLIENT_URL,
})));

app.get('/api/projects', wrap(() => listProjects()));

app.post('/api/projects', wrap((req) => {
  const format = (FORMAT_IDS.includes(req.body?.format) ? req.body.format : '9:16') as FormatId;
  return createProject(String(req.body?.name || 'Proyecto sin título'), format);
}));

app.get('/api/projects/:id', wrap((req) => loadProject(pid(req))));

app.put('/api/projects/:id', wrap((req) => {
  const body = req.body as Project;
  if (body.id !== pid(req)) throw new Error('id no coincide');
  const saved = saveFromClient(body);
  return { updatedAt: saved.updatedAt };
}));

app.get('/api/projects/:id/events', (req, res) => {
  try {
    subscribe(pid(req), res);
  } catch (e: any) {
    res.status(400).end(String(e?.message));
  }
});

app.post('/api/projects/:id/upload', upload.array('files'), wrap(async (req) => {
  const id = pid(req);
  const files = (req.files as Express.Multer.File[]) ?? [];
  const assets = [];
  for (const f of files) {
    const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
    assets.push(await importFile(id, f.path, name, true));
  }
  return assets;
}));

app.post('/api/projects/:id/import-path', wrap(async (req) => {
  const src = resolveImportPath(String(req.body?.path ?? ''));
  return importFile(pid(req), src, path.basename(src));
}));

app.post('/api/projects/:id/assets/:assetId/transcribe', wrap(async (req) => {
  const id = pid(req);
  const assetId = String(req.params.assetId);
  // Se lanza en segundo plano; el progreso llega por eventos.
  transcribeAsset(id, assetId, req.body?.language || 'auto').catch((e) => console.error('[whisper]', e));
  return { ok: true };
}));

app.post('/api/projects/:id/assets/:assetId/facetrack', wrap((req) => {
  const rate = Number(req.body?.rate);
  const points = req.body?.points;
  const valid =
    rate > 0 && rate <= 30 && Array.isArray(points) && points.length <= 50000 &&
    points.every((p: unknown) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && v >= 0 && v <= 1));
  if (!valid) throw new Error('Seguimiento de cara no válido');
  const a = updateAsset(pid(req), String(req.params.assetId), { faceTrack: { rate, points } });
  if (!a) throw new Error('Medio no encontrado');
  return a;
}));

app.get('/api/projects/:id/assets/:assetId/transcript', wrap((req) => readTranscript(pid(req), String(req.params.assetId))));

app.post('/api/projects/:id/export', wrap((req) => {
  const id = pid(req);
  const formats: FormatId[] = (req.body?.formats ?? [loadProject(id).format]).filter((f: FormatId) => FORMAT_IDS.includes(f));
  return formats.map((format) =>
    startExport(id, {
      format,
      fps: [24, 25, 30, 50, 60].includes(req.body?.fps) ? req.body.fps : 30,
      quality: req.body?.quality ?? 'high',
      normalize: req.body?.normalize !== false,
      range: req.body?.range,
      scale: Number(req.body?.scale) || 1,
      codec: req.body?.codec === 'hevc' ? 'hevc' : 'h264',
    }),
  );
}));

app.post('/api/projects/:id/frame', wrap(async (req) => {
  const id = pid(req);
  const format = (FORMAT_IDS.includes(req.body?.format) ? req.body.format : loadProject(id).format) as FormatId;
  return renderFrame(id, format, Math.max(0, Number(req.body?.time) || 0), Number(req.body?.scale) || 1);
}));

app.get('/api/projects/:id/exports', wrap((req) => [...jobs.values()].filter((j) => j.projectId === pid(req))));
app.post('/api/jobs/:jobId/cancel', wrap((req) => {
  cancelExport(String(req.params.jobId));
  return { ok: true };
}));

app.post('/api/reveal', wrap((req) => {
  const file = path.resolve(String(req.body?.path ?? ''));
  const rel = path.relative(PROJECTS_DIR, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Ruta fuera de los proyectos');
  if (process.platform === 'darwin') execFile('open', ['-R', file]);
  return { ok: true };
}));

app.post('/api/projects/:id/rename', wrap((req) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) throw new Error('Nombre vacío');
  mutateProject(pid(req), (p) => (p.name = name));
  return { ok: true };
}));

app.get('/api/projects/:id/history', wrap((req) => listHistory(pid(req))));
app.post('/api/projects/:id/history/restore', wrap((req) => {
  restoreHistory(pid(req), String(req.body?.file ?? ''));
  return { ok: true };
}));

app.post('/api/projects/:id/ai', wrap(async (req) => {
  if (!aiAvailable()) throw new Error('Falta ANTHROPIC_API_KEY en el fichero .env para usar el chat integrado.');
  snapshot(pid(req), 'ia');
  return chat(pid(req), String(req.body?.message ?? ''), req.body?.context);
}));
app.post('/api/projects/:id/ai/reset', wrap((req) => {
  resetChat(pid(req));
  return { ok: true };
}));

// Ficheros de cada proyecto (medios, proxies, exportaciones) con soporte de rangos
app.use('/files/:id', (req, res, next) => {
  let id: string;
  try {
    id = safeId(String(req.params.id));
  } catch {
    return res.status(400).end();
  }
  express.static(projectDir(id), { dotfiles: 'allow', maxAge: 0 })(req, res, next);
});

if (IS_PROD) {
  const dist = path.join(ROOT, 'dist');
  app.use(express.static(dist));
  app.get(/^(?!\/api|\/files).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Studio IA · servidor en http://localhost:${PORT}`);
  console.log(`  Interfaz:  ${CLIENT_URL}`);
  console.log(`  Proyectos: ${PROJECTS_DIR}\n`);
  resumePendingAssets();
});
