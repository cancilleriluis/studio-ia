// Prepara la detección de caras (Auto Reframe) para que funcione en local y sin conexión:
// copia el runtime WASM de MediaPipe a public/ y descarga el modelo BlazeFace (Apache 2.0).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const wasmSrc = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDst = path.join(root, 'public', 'mediapipe');
const modelDst = path.join(root, 'public', 'models', 'blaze_face_short_range.tflite');
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

if (fs.existsSync(wasmSrc)) {
  fs.mkdirSync(wasmDst, { recursive: true });
  for (const f of fs.readdirSync(wasmSrc)) fs.copyFileSync(path.join(wasmSrc, f), path.join(wasmDst, f));
  console.log('✓ MediaPipe WASM copiado a public/mediapipe');
}
if (!fs.existsSync(modelDst)) {
  fs.mkdirSync(path.dirname(modelDst), { recursive: true });
  try {
    execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', '-o', `${modelDst}.part`, MODEL_URL], { stdio: 'inherit' });
    fs.renameSync(`${modelDst}.part`, modelDst);
    console.log('✓ Modelo de detección de caras descargado');
  } catch {
    console.warn('⚠️  No se pudo descargar el modelo de caras (Auto Reframe). Vuelve a ejecutar: npm run setup:faces');
  }
}
