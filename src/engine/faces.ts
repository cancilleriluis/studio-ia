// Auto Reframe: detección de caras local con MediaPipe (BlazeFace) y un
// suavizado tipo «cámara lenta» para que el encuadre no tiemble.

import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

let detectorPromise: Promise<FaceDetector> | null = null;

function detector(): Promise<FaceDetector> {
  detectorPromise ??= FilesetResolver.forVisionTasks('/mediapipe').then((files) =>
    FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite', delegate: 'GPU' },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.5,
    }),
  );
  detectorPromise.catch(() => (detectorPromise = null));
  return detectorPromise;
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener('seeked', done);
      resolve();
    };
    v.addEventListener('seeked', done);
    v.currentTime = t;
  });
}

/** Mediana móvil para quitar detecciones sueltas erróneas. */
function median(values: number[], radius: number): number[] {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - radius), i + radius + 1).sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}

/**
 * «Cámara» virtual: solo se mueve cuando la cara sale de una zona muerta y lo
 * hace con suavidad (como el preajuste «Lento» de Auto Reframe en Premiere).
 */
function smoothCamera(values: number[], deadzone = 0.05, follow = 0.22): number[] {
  if (!values.length) return values;
  let cam = values.slice(0, 4).reduce((a, b) => a + b, 0) / Math.min(4, values.length);
  let vel = 0;
  return values.map((v) => {
    const d = v - cam;
    const target = Math.abs(d) > deadzone ? d - Math.sign(d) * deadzone : 0;
    vel = vel * 0.6 + target * follow;
    cam += vel;
    return Math.min(1, Math.max(0, cam));
  });
}

export async function analyzeFaces(
  url: string,
  duration: number,
  onProgress: (p: number) => void,
  rate = 4,
): Promise<{ rate: number; points: [number, number][] }> {
  const det = await detector();
  const v = document.createElement('video');
  v.src = url;
  v.muted = true;
  v.preload = 'auto';
  v.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve();
    v.onerror = () => reject(new Error('No se pudo leer el vídeo para analizar caras'));
  });
  const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
  const cw = Math.round(v.videoWidth * scale);
  const ch = Math.round(v.videoHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;

  const n = Math.max(1, Math.ceil(duration * rate));
  const xs: (number | null)[] = [];
  const ys: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    await seek(v, Math.min(duration - 0.01, i / rate));
    ctx.drawImage(v, 0, 0, cw, ch);
    const res = det.detect(canvas);
    // La cara más grande (la persona principal)
    let best: { x: number; y: number; area: number } | null = null;
    for (const d of res.detections) {
      const b = d.boundingBox;
      if (!b) continue;
      const area = b.width * b.height;
      if (!best || area > best.area) best = { x: (b.originX + b.width / 2) / cw, y: (b.originY + b.height * 0.45) / ch, area };
    }
    xs.push(best ? best.x : null);
    ys.push(best ? best.y : null);
    if (i % 4 === 0) onProgress(i / n);
  }
  v.removeAttribute('src');
  v.load();

  // Rellenar huecos sin cara con la detección más cercana (o el centro)
  const fill = (arr: (number | null)[]) => {
    const out = [...arr];
    let last: number | null = null;
    for (let i = 0; i < out.length; i++) {
      if (out[i] === null) out[i] = last;
      else last = out[i];
    }
    let next: number | null = null;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i] === null) out[i] = next;
      else next = out[i];
    }
    return out.map((v) => v ?? 0.5);
  };
  const sx = smoothCamera(median(fill(xs), 2));
  const sy = smoothCamera(median(fill(ys), 2), 0.06);
  onProgress(1);
  return { rate, points: sx.map((x, i) => [Math.round(x * 1000) / 1000, Math.round(sy[i] * 1000) / 1000]) };
}
