// Transcripción local con whisper.cpp (whisper-cli), palabra a palabra.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TranscriptFile, Word } from '../shared/types';
import { run } from './ffmpeg';
import { findBinary, findWhisperModel } from './config';
import { mediaDir, mediaPath, updateAsset, loadProject } from './store';
import { alignWords, speechSegments } from '../shared/silence';

export function whisperStatus() {
  return { binary: findBinary('whisper-cli') ?? null, model: findWhisperModel() ?? null };
}

const running = new Set<string>();

export async function transcribeAsset(projectId: string, assetId: string, language = 'auto'): Promise<void> {
  const key = `${projectId}:${assetId}`;
  if (running.has(key)) return;
  const { binary, model } = whisperStatus();
  if (!binary) throw new Error('No se encontró whisper-cli. Instálalo con: brew install whisper-cpp');
  if (!model) throw new Error('No se encontró un modelo de Whisper. Ejecuta: npm run setup:whisper');
  const p = loadProject(projectId);
  const asset = p.assets.find((a) => a.id === assetId);
  if (!asset) throw new Error('Medio no encontrado');
  if (!asset.hasAudio) throw new Error('Este medio no tiene audio');

  running.add(key);
  updateAsset(projectId, assetId, { transcriptStatus: 'processing' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-whisper-'));
  try {
    const dir = mediaDir(projectId);
    const wav = path.join(tmp, 'audio.wav');
    await run('ffmpeg', ['-y', '-i', mediaPath(projectId, asset.file), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
    const outBase = path.join(tmp, 'out');
    const threads = String(Math.max(2, Math.min(8, os.cpus().length - 2)));
    await run(binary, ['-m', model, '-f', wav, '-l', language, '-ml', '1', '-sow', '-oj', '-of', outBase, '-t', threads, '-np']);
    const json = JSON.parse(fs.readFileSync(`${outBase}.json`, 'utf8'));
    let words = parseWords(json.transcription ?? []);
    const wave = asset.waveform ? mediaPath(projectId, asset.waveform) : '';
    if (wave && fs.existsSync(wave)) {
      const w = JSON.parse(fs.readFileSync(wave, 'utf8')) as { rate: number; peaks: number[] };
      words = alignWords(words, speechSegments(w.peaks, w.rate));
    }
    const transcript: TranscriptFile = { language: json.result?.language, words };
    const base = path.basename(asset.file, path.extname(asset.file));
    const rel = `.proxy/${base}.transcript.json`;
    fs.mkdirSync(path.join(dir, '.proxy'), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), JSON.stringify(transcript));
    updateAsset(projectId, assetId, { transcript: rel, transcriptStatus: 'ready' });
  } catch (e) {
    updateAsset(projectId, assetId, { transcriptStatus: 'error' });
    throw e;
  } finally {
    running.delete(key);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function parseWords(items: any[]): Word[] {
  const words: Word[] = [];
  for (const it of items) {
    const raw: string = it.text ?? '';
    const text = raw.trim();
    if (!text || /^\[.*\]$/.test(text) || /^\(.*\)$/.test(text)) continue;
    const start = (it.offsets?.from ?? 0) / 1000;
    const end = (it.offsets?.to ?? 0) / 1000;
    const prev = words[words.length - 1];
    // Signos sueltos o trozos sin espacio inicial se unen a la palabra anterior
    if (prev && (/^[.,!?;:…%)»"']+$/.test(text) || (!raw.startsWith(' ') && start - prev.end < 0.05))) {
      prev.text += text;
      prev.end = Math.max(prev.end, end);
      continue;
    }
    words.push({ start, end: Math.max(end, start + 0.04), text });
  }
  return words;
}

export function readTranscript(projectId: string, assetId: string): TranscriptFile | null {
  const p = loadProject(projectId);
  const a = p.assets.find((x) => x.id === assetId);
  if (!a?.transcript) return null;
  const file = mediaPath(projectId, a.transcript);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function readAllTranscripts(projectId: string): Record<string, TranscriptFile> {
  const p = loadProject(projectId);
  const out: Record<string, TranscriptFile> = {};
  for (const a of p.assets) {
    const t = a.transcript ? readTranscript(projectId, a.id) : null;
    if (t) out[a.id] = t;
  }
  return out;
}
