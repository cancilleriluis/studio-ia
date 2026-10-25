// Descarga un modelo de Whisper (whisper.cpp) en ./models para los subtítulos automáticos.
// Uso: npm run setup:whisper [-- small|medium|large-v3-turbo]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const size = process.argv[2] ?? 'small';
if (!/^[a-z0-9.-]+$/.test(size)) throw new Error(`Modelo no válido: ${size}`);
const dir = path.resolve('models');
const file = path.join(dir, `ggml-${size}.bin`);
const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${size}.bin`;

try {
  execFileSync('which', ['whisper-cli'], { stdio: 'ignore' });
} catch {
  console.log('⚠️  No se encontró whisper-cli. Instálalo con:  brew install whisper-cpp');
}

if (fs.existsSync(file)) {
  console.log(`✓ Ya existe ${file}`);
  process.exit(0);
}
fs.mkdirSync(dir, { recursive: true });
console.log(`Descargando ${url}\n→ ${file}`);
execFileSync('curl', ['-L', '--fail', '--progress-bar', '-o', `${file}.part`, url], { stdio: 'inherit' });
fs.renameSync(`${file}.part`, file);
console.log('✓ Modelo listo');
