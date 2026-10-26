// Exportación a MP4. Cada fotograma se dibuja con el mismo motor que la
// previsualización (en un Chrome sin ventana), así que lo que ves es lo que
// exportas: vidrio, cromo líquido, subtítulos y efectos incluidos.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import puppeteer, { type Browser } from 'puppeteer';
import type { FormatId } from '../shared/types';
import { FORMATS } from '../shared/formats';
import { uid } from '../shared/id';
import { projectDuration } from '../shared/ops';
import { CLIENT_URL } from './config';
import { mixProjectAudio } from './audiomix';
import { run } from './ffmpeg';
import { PROXY_LONG_SIDE, ensureHiresProxy } from './media';
import { broadcast, exportsDir, loadProject } from './store';

export interface ExportOptions {
  format: FormatId;
  fps: number;
  quality: 'high' | 'standard' | 'draft';
  normalize: boolean;
  range?: [number, number];
  /** Multiplicador de resolución: 2 = 4K en 16:9, 0.5 = borrador. */
  scale?: number;
  codec?: 'h264' | 'hevc';
}

const HAS_VIDEOTOOLBOX = (() => {
  try {
    return execFileSync('ffmpeg', ['-hide_banner', '-encoders']).toString().includes('hevc_videotoolbox');
  } catch {
    return false;
  }
})();

function videoEncoder(codec: 'h264' | 'hevc', quality: ExportOptions['quality']): string[] {
  const crf = quality === 'high' ? 16 : quality === 'standard' ? 20 : 26;
  const preset = quality === 'draft' ? 'veryfast' : 'medium';
  if (codec === 'hevc') {
    // HEVC acelerado por el chip del Mac: archivos ~40 % más pequeños
    return HAS_VIDEOTOOLBOX
      ? ['-c:v', 'hevc_videotoolbox', '-q:v', quality === 'high' ? '72' : quality === 'standard' ? '60' : '45', '-tag:v', 'hvc1']
      : ['-c:v', 'libx265', '-preset', preset, '-crf', String(crf + 5), '-tag:v', 'hvc1'];
  }
  return ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf)];
}

export interface ExportJob {
  id: string;
  projectId: string;
  format: FormatId;
  status: 'queued' | 'preparing' | 'rendering' | 'audio' | 'encoding' | 'done' | 'error' | 'cancelled';
  progress: number;
  file?: string;
  url?: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
  fps?: number;
}

export const jobs = new Map<string, ExportJob>();
const cancelled = new Set<string>();

/**
 * Cada proceso de render usa su propio Chrome con una sola página: así esa página
 * está siempre en primer plano. Con varias pestañas en un mismo Chrome, las ocultas
 * no pintan ni cargan vídeo y la exportación se queda esperando.
 */
function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--enable-unsafe-swiftshader',
      '--disable-background-media-suspend',
      '--disable-features=BackgroundMediaSuspend,IntensiveWakeUpThrottling',
    ],
  });
}

function slug(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'video';
}

function stamp() {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

function emit(job: ExportJob) {
  broadcast(job.projectId, 'job', job);
}

export function startExport(projectId: string, opts: ExportOptions): ExportJob {
  const job: ExportJob = {
    id: uid('job_'),
    projectId,
    format: opts.format,
    status: 'queued',
    progress: 0,
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);
  emit(job);
  exportQueue = exportQueue.then(() => runExport(job, opts)).catch(() => {});
  return job;
}

export function cancelExport(id: string) {
  cancelled.add(id);
}

let exportQueue: Promise<void> = Promise.resolve();

async function runExport(job: ExportJob, opts: ExportOptions) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-render-'));
  try {
    if (cancelled.has(job.id)) throw new Error('cancelled');
    const p = loadProject(job.projectId);
    const { width, height } = FORMATS[opts.format];
    const fullDuration = projectDuration(p);
    if (fullDuration <= 0) throw new Error('El proyecto está vacío');
    const [r0, r1] = opts.range ?? [0, fullDuration];
    const duration = Math.max(0.1, r1 - r0);
    const fps = opts.fps;
    const total = Math.ceil(duration * fps);
    const scale = Math.min(2, Math.max(0.25, opts.scale ?? 1));
    const codec = opts.codec ?? 'h264';
    const encoder = videoEncoder(codec, opts.quality);

    // Por encima de la resolución de la copia de edición (4K), usar el vídeo a resolución completa
    const hires = Math.max(width, height) * scale > PROXY_LONG_SIDE;
    if (hires) {
      const used = new Set<string>();
      for (const c of p.clips) {
        if (c.type === 'video') used.add(c.assetId);
        if (c.type === 'template') {
          for (const pn of (c.props.panels ?? []) as { assetId?: string }[]) if (pn?.assetId) used.add(pn.assetId);
          if (c.props.background) used.add(c.props.background);
        }
      }
      const assets = p.assets.filter((a) => used.has(a.id) && a.type === 'video' && Math.max(a.width ?? 0, a.height ?? 0) > PROXY_LONG_SIDE);
      job.status = 'preparing';
      emit(job);
      for (const [k, a] of assets.entries()) {
        if (cancelled.has(job.id)) throw new Error('cancelled');
        await ensureHiresProxy(job.projectId, a, (f) => {
          job.progress = ((k + f) / assets.length) * 0.15;
          emit(job);
        });
      }
    }

    job.status = 'rendering';
    emit(job);

    // En 4K cada página ocupa 4 veces más memoria: menos procesos en paralelo
    const maxWorkers = scale > 1 ? 3 : 6;
    const workers = Math.max(1, Math.min(Math.ceil(total / 90), maxWorkers, Math.floor(os.cpus().length / 2)));
    const per = Math.ceil(total / workers);
    const done = new Array(workers).fill(0);
    let lastEmit = 0;
    const report = () => {
      const now = Date.now();
      if (now - lastEmit < 250) return;
      lastEmit = now;
      const elapsed = (now - job.startedAt) / 1000;
      const frames = done.reduce((a, b) => a + b, 0);
      job.progress = (hires ? 0.15 : 0) + (frames / total) * (hires ? 0.73 : 0.88);
      job.fps = Math.round((frames / Math.max(elapsed, 0.1)) * 10) / 10;
      emit(job);
    };

    const segments: string[] = [];
    const aborted = { value: false };
    await Promise.all(
      Array.from({ length: workers }, async (_, w) => {
        const from = w * per;
        const to = Math.min(total, from + per);
        if (from >= to) return;
        const seg = path.join(tmp, `seg${w}.mp4`);
        segments[w] = seg;
        const args: SegmentArgs = {
          projectId: job.projectId, format: opts.format, width, height, scale, hires, fps, from, to, offset: r0, out: seg, encoder,
          onFrame: (n) => {
            done[w] = n;
            report();
          },
          isCancelled: () => cancelled.has(job.id) || aborted.value,
        };
        // Un fallo puntual (p. ej. una página que no arranca) se reintenta una vez
        try {
          await renderSegment(args);
        } catch (e) {
          if (cancelled.has(job.id) || aborted.value) throw e;
          console.warn(`[render] reintentando el tramo ${w + 1}:`, String((e as Error)?.message ?? e).slice(0, 200));
          done[w] = 0;
          try {
            await renderSegment(args);
          } catch (e2) {
            aborted.value = true; // detener el resto de tramos: el trabajo ya no puede terminar
            throw e2;
          }
        }
      }),
    );
    if (cancelled.has(job.id)) throw new Error('cancelled');

    job.status = 'audio';
    job.progress = 0.9;
    emit(job);
    const sub = structuredClone(p);
    if (r0 > 0) {
      for (const c of sub.clips) c.start -= r0;
    }
    const wav = path.join(tmp, 'mix.wav');
    await mixProjectAudio(sub, duration, wav);

    job.status = 'encoding';
    job.progress = 0.95;
    emit(job);
    const list = path.join(tmp, 'list.txt');
    fs.writeFileSync(list, segments.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
    const outDir = exportsDir(job.projectId);
    fs.mkdirSync(outDir, { recursive: true });
    const res = `${Math.round(width * scale)}x${Math.round(height * scale)}`;
    const name = `${slug(p.name)}_${opts.format.replace(':', 'x')}_${res}${codec === 'hevc' ? '_hevc' : ''}_${stamp()}.mp4`;
    const out = path.join(outDir, name);
    const audioFilter = opts.normalize ? ['-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000'] : [];
    await run('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', wav,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy', ...(codec === 'hevc' ? ['-tag:v', 'hvc1'] : []), ...audioFilter, '-c:a', 'aac', '-b:a', '256k',
      '-t', duration.toFixed(3),
      '-movflags', '+faststart', out,
    ]);
    job.status = 'done';
    job.progress = 1;
    job.file = out;
    job.url = `/files/${job.projectId}/exports/${encodeURIComponent(name)}`;
    job.finishedAt = Date.now();
    emit(job);
  } catch (e: any) {
    job.status = cancelled.has(job.id) ? 'cancelled' : 'error';
    job.error = job.status === 'error' ? String(e?.message ?? e).slice(0, 800) : undefined;
    job.finishedAt = Date.now();
    console.error('[render]', e);
    emit(job);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

interface SegmentArgs {
  projectId: string;
  format: FormatId;
  width: number;
  height: number;
  scale: number;
  hires: boolean;
  fps: number;
  from: number;
  to: number;
  offset: number;
  out: string;
  encoder: string[];
  onFrame: (n: number) => void;
  isCancelled: () => boolean;
}

async function renderSegment(a: SegmentArgs) {
  const browser = await launchBrowser();
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  const ff = spawn('ffmpeg', [
    '-hide_banner', '-y',
    '-f', 'image2pipe', '-framerate', String(a.fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    ...a.encoder,
    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-r', String(a.fps), a.out,
  ]);
  let ffErr = '';
  ff.stderr.on('data', (d) => (ffErr = (ffErr + d.toString()).slice(-4000)));
  const ffDone = new Promise<void>((resolve, reject) =>
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg (vídeo): ${ffErr}`)))),
  );
  ffDone.catch(() => {}); // se gestiona abajo; evita rechazos sin capturar si se aborta antes
  ff.stdin.on('error', () => {});
  try {
    page.on('console', (m) => {
      if (m.type() === 'error') console.warn('[render page]', m.text());
    });
    page.on('pageerror', (e) => console.warn('[render page error]', e));
    await openRenderPage(page, a.projectId, a.format, a.width, a.height, a.scale, a.hires);
    for (let i = a.from; i < a.to; i++) {
      if (a.isCancelled()) throw new Error('cancelled');
      const t = a.offset + i / a.fps;
      await page.evaluate((tt) => (window as any).__studio.seek(tt), t);
      const img = await page.screenshot({ type: 'jpeg', quality: 93, optimizeForSpeed: true });
      if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once('drain', r));
      a.onFrame(i - a.from + 1);
    }
    ff.stdin.end();
    await ffDone;
  } catch (e) {
    ff.kill('SIGKILL');
    throw e;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function openRenderPage(page: import('puppeteer').Page, projectId: string, format: FormatId, width: number, height: number, scale: number, hires = false) {
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  const url = `${CLIENT_URL}/?render=1&project=${encodeURIComponent(projectId)}&format=${encodeURIComponent(format)}${hires ? '&hires=1' : ''}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Comprobar por tiempo y no por fotograma pintado: las pestañas en segundo plano
  // (al exportar con varios procesos) no pintan y la espera no terminaría nunca.
  await page.waitForFunction('window.__studio && window.__studio.ready === true', { timeout: 120000, polling: 100 });
}

/** Exporta un único fotograma en PNG (miniaturas de YouTube, portadas de Reels...). */
export async function renderFrame(projectId: string, format: FormatId, time: number, scale = 1): Promise<{ file: string; url: string }> {
  const p = loadProject(projectId);
  const { width, height } = FORMATS[format];
  const browser = await launchBrowser();
  const page = (await browser.pages())[0] ?? (await browser.newPage());
  try {
    await openRenderPage(page, projectId, format, width, height, Math.min(2, Math.max(0.25, scale)));
    await page.evaluate((tt) => (window as any).__studio.seek(tt), time);
    const outDir = exportsDir(projectId);
    fs.mkdirSync(outDir, { recursive: true });
    const tc = time.toFixed(2).replace('.', 's');
    const name = `${slug(p.name)}_${format.replace(':', 'x')}_fotograma_${tc}_${stamp()}.png`;
    const file = path.join(outDir, name);
    await page.screenshot({ type: 'png', path: file as `${string}.png` });
    return { file, url: `/files/${projectId}/exports/${encodeURIComponent(name)}` };
  } finally {
    await browser.close().catch(() => {});
  }
}
