import 'dotenv/config';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PORT = Number(process.env.STUDIO_PORT ?? 3210);
export const IS_PROD = process.env.NODE_ENV === 'production';
/** URL donde se sirve la interfaz (la usa el render en Chrome sin cabeza). */
export const CLIENT_URL = process.env.STUDIO_CLIENT_URL ?? (IS_PROD ? `http://localhost:${PORT}` : 'http://localhost:5173');
export const PROJECTS_DIR = path.resolve(process.env.STUDIO_PROJECTS_DIR ?? path.join(ROOT, 'projects'));
export const AI_MODEL = process.env.STUDIO_AI_MODEL ?? 'claude-opus-5-5';

fs.mkdirSync(PROJECTS_DIR, { recursive: true });

function firstExisting(paths: string[]): string | undefined {
  return paths.find((p) => p && fs.existsSync(p));
}

export function findWhisperModel(): string | undefined {
  if (process.env.WHISPER_MODEL && fs.existsSync(process.env.WHISPER_MODEL)) return process.env.WHISPER_MODEL;
  const dirs = [
    path.join(ROOT, 'models'),
    path.join(os.homedir(), '.config', 'murmur', 'models'),
    path.join(os.homedir(), '.cache', 'whisper'),
    '/opt/homebrew/share/whisper-cpp',
    '/usr/local/share/whisper-cpp',
  ];
  const preference = ['large-v3-turbo', 'large-v3', 'medium', 'small', 'base'];
  for (const pref of preference) {
    for (const d of dirs) {
      if (!fs.existsSync(d)) continue;
      const hit = fs.readdirSync(d).find((f) => f.startsWith('ggml-') && f.endsWith('.bin') && f.includes(pref) && !f.includes('test'));
      if (hit) return path.join(d, hit);
    }
  }
  return undefined;
}

export function findBinary(name: string): string | undefined {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).concat(['/opt/homebrew/bin', '/usr/local/bin']);
  return firstExisting(dirs.map((d) => path.join(d, name)));
}
