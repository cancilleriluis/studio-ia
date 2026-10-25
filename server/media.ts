// Importación y procesado de medios: proxy de edición, tira de miniaturas y
// forma de onda. Igual que los "proxies" de Premiere, para que la línea de
// tiempo vaya fluida con cualquier códec (HEVC, ProRes, 4K...).

import fs from 'node:fs';
import path from 'node:path';
import type { Asset, AssetType } from '../shared/types';
import { uid } from '../shared/id';
import { decodePcm, ffmpegWithProgress, probe, run } from './ffmpeg';
import { broadcast, mediaDir, mutateProject, updateAsset } from './store';

const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi', '.mts', '.mxf', '.hevc', '.3gp'];
const AUDIO_EXT = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.aiff', '.aif', '.caf'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif', '.heic', '.heif', '.tif', '.tiff', '.bmp'];
const BROWSER_IMAGES = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'];
const BROWSER_AUDIO = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus'];

export const PEAKS_PER_SECOND = 100;

export function detectType(file: string): AssetType | null {
  const ext = path.extname(file).toLowerCase();
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  if (IMAGE_EXT.includes(ext)) return 'image';
  return null;
}

function uniqueName(dir: string, name: string): string {
  const ext = path.extname(name);
  const base = path.basename(name, ext).replace(/[^\w\-. áéíóúñÁÉÍÓÚÑ]/g, '_');
  let candidate = `${base}${ext}`;
  let i = 1;
  while (fs.existsSync(path.join(dir, candidate))) candidate = `${base}-${i++}${ext}`;
  return candidate;
}

/** Copia (o mueve) un fichero al proyecto y lanza su procesado en segundo plano. */
export async function importFile(projectId: string, src: string, originalName: string, move = false): Promise<Asset> {
  const type = detectType(originalName);
  if (!type) throw new Error(`Formato no soportado: ${originalName}`);
  const dir = mediaDir(projectId);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = uniqueName(dir, originalName);
  const dest = path.join(dir, fileName);
  if (move) {
    try {
      fs.renameSync(src, dest);
    } catch {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    }
  } else fs.copyFileSync(src, dest);

  const info = await probe(dest);
  const asset: Asset = {
    id: uid('a_'),
    name: path.basename(originalName, path.extname(originalName)),
    type,
    file: fileName,
    duration: type === 'image' ? 5 : info.duration,
    width: info.video?.width,
    height: info.video?.height,
    fps: info.video?.fps,
    hasAudio: type !== 'image' && !!info.audio,
    status: 'processing',
    progress: 0,
    transcriptStatus: 'none',
  };
  mutateProject(projectId, (p) => p.assets.push(asset), 'silent');
  broadcast(projectId, 'asset', asset);
  enqueue(() => processAsset(projectId, asset, info.video?.fps ?? 30));
  return asset;
}

let queue: Promise<unknown> = Promise.resolve();
function enqueue(job: () => Promise<void>) {
  queue = queue.then(job).catch((e) => console.error('[media]', e));
}

async function processAsset(projectId: string, asset: Asset, fps: number) {
  const dir = mediaDir(projectId);
  const src = path.join(dir, asset.file);
  const base = path.basename(asset.file, path.extname(asset.file));
  const patch: Partial<Asset> = {};
  try {
    if (asset.type === 'video') {
      const proxy = `.proxy/${base}.proxy.mp4`;
      fs.mkdirSync(path.join(dir, '.proxy'), { recursive: true });
      const outFps = fps > 45 ? 60 : fps > 26 ? 30 : Math.max(24, Math.round(fps));
      const longSide = 1920;
      const scale =
        (asset.width ?? 0) >= (asset.height ?? 0)
          ? `scale='min(${longSide},iw)':-2:out_range=tv`
          : `scale=-2:'min(${longSide},ih)':out_range=tv`;
      await ffmpegWithProgress(
        [
          '-y', '-i', src,
          '-map', '0:v:0', '-map', '0:a:0?',
          '-vf', `${scale},format=yuv420p`,
          '-r', String(outFps),
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
          '-g', '6', '-bf', '0', '-tune', 'fastdecode',
          '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
          '-movflags', '+faststart',
          path.join(dir, proxy),
        ],
        asset.duration,
        (p) => updateAsset(projectId, asset.id, { progress: Math.round(p * 80) / 100 }),
      );
      patch.proxy = proxy;
      patch.filmstrip = await makeFilmstrip(dir, path.join(dir, proxy), base, asset);
    } else if (asset.type === 'image' && !BROWSER_IMAGES.includes(path.extname(asset.file).toLowerCase())) {
      const proxy = `.proxy/${base}.png`;
      fs.mkdirSync(path.join(dir, '.proxy'), { recursive: true });
      await run('ffmpeg', ['-y', '-i', src, '-frames:v', '1', path.join(dir, proxy)]);
      patch.proxy = proxy;
    } else if (asset.type === 'audio' && !BROWSER_AUDIO.includes(path.extname(asset.file).toLowerCase())) {
      const proxy = `.proxy/${base}.m4a`;
      fs.mkdirSync(path.join(dir, '.proxy'), { recursive: true });
      await run('ffmpeg', ['-y', '-i', src, '-vn', '-c:a', 'aac', '-b:a', '256k', path.join(dir, proxy)]);
      patch.proxy = proxy;
    }
    if (asset.hasAudio) {
      patch.waveform = await makeWaveform(dir, src, base);
    }
    patch.status = 'ready';
    patch.progress = 1;
  } catch (e: any) {
    console.error('[media] error procesando', asset.file, e);
    patch.status = 'error';
    patch.error = String(e?.message ?? e).slice(0, 500);
  }
  updateAsset(projectId, asset.id, patch);
}

async function makeFilmstrip(dir: string, src: string, base: string, asset: Asset) {
  const interval = Math.max(0.5, asset.duration / 100);
  const count = Math.max(1, Math.min(100, Math.ceil(asset.duration / interval)));
  const tileH = 108;
  const aspect = (asset.width ?? 16) / (asset.height ?? 9);
  const tileW = Math.round((tileH * aspect) / 2) * 2;
  const cols = 10;
  const rows = Math.ceil(count / cols);
  const file = `.proxy/${base}.strip.jpg`;
  await run('ffmpeg', [
    '-y', '-i', src,
    '-vf', `fps=1/${interval},scale=${tileW}:${tileH},tile=${cols}x${rows}`,
    '-frames:v', '1', '-q:v', '4',
    path.join(dir, file),
  ]);
  return { file, interval, tileW, tileH, count, cols };
}

async function makeWaveform(dir: string, src: string, base: string) {
  const rate = 8000;
  const pcm = await decodePcm(src, { sampleRate: rate, channels: 1 });
  const per = rate / PEAKS_PER_SECOND;
  const peaks: number[] = [];
  for (let i = 0; i < pcm.length; i += per) {
    let m = 0;
    const end = Math.min(pcm.length, i + per);
    for (let j = i; j < end; j++) {
      const v = Math.abs(pcm[j]);
      if (v > m) m = v;
    }
    peaks.push(Math.round(m * 1000) / 1000);
  }
  const file = `.proxy/${base}.wave.json`;
  fs.writeFileSync(path.join(dir, file), JSON.stringify({ rate: PEAKS_PER_SECOND, peaks }));
  return file;
}
