import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Asset } from '../../shared/types';
import { renderMode, track } from './renderSync';
import { setChannel } from './audioEngine';

export function assetUrl(projectId: string, asset: Asset, original = false): string {
  const rel = !original && asset.proxy ? asset.proxy : asset.file;
  return `/files/${encodeURIComponent(projectId)}/media/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

export function mediaFileUrl(projectId: string, rel: string): string {
  return `/files/${encodeURIComponent(projectId)}/media/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

function waitEvent(el: HTMLMediaElement, ev: string, timeout = 5000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener(ev, done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, timeout);
    el.addEventListener(ev, done);
  });
}

async function seekExact(v: HTMLVideoElement, t: number): Promise<void> {
  if (v.readyState < 1) await waitEvent(v, 'loadedmetadata', 15000);
  const target = Math.max(0, Math.min(t + 0.001, (v.duration || t + 1) - 0.001));
  if (Math.abs(v.currentTime - target) < 0.0005 && v.readyState >= 2 && !v.seeking) return;
  const seeked = waitEvent(v, 'seeked', 8000);
  v.currentTime = target;
  await seeked;
  // En Chrome sin ventana el callback de fotograma a veces no llega: espera corta
  if ('requestVideoFrameCallback' in v) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 40);
      (v as any).requestVideoFrameCallback(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

interface VideoProps {
  src: string;
  sourceTime: number;
  active: boolean;
  playing: boolean;
  rate?: number;
  volume?: number;
  enhance?: boolean;
  style?: CSSProperties;
}

/** Envía el sonido del elemento al mezclador Web Audio solo si alguna vez ha de sonar. */
function routeAudio(el: HTMLMediaElement, attached: { current: boolean }, gain: number, enhance: boolean) {
  if (!attached.current && gain <= 0.001) {
    el.muted = true;
    return;
  }
  attached.current = true;
  el.muted = false;
  setChannel(el, gain, enhance);
}

/** Vídeo sincronizado con el reloj del editor (o con el fotograma exacto al exportar). */
export function VideoView({ src, sourceTime, active, playing, rate = 1, volume = 0, enhance = false, style }: VideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const attached = useRef(false);

  useLayoutEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (renderMode) {
      v.muted = true;
      track(seekExact(v, sourceTime));
      return;
    }
    v.playbackRate = rate;
    const audible = active && playing && volume > 0.001;
    routeAudio(v, attached, audible ? volume : 0, enhance);
    if (playing && active) {
      if (v.paused) {
        v.currentTime = sourceTime;
        v.play().catch(() => {});
      } else if (Math.abs(v.currentTime - sourceTime) > 0.18) {
        v.currentTime = sourceTime;
      }
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - sourceTime) > 1 / 120) v.currentTime = sourceTime;
    }
  });

  return (
    <video
      ref={ref}
      src={src}
      preload="auto"
      playsInline
      muted
      disablePictureInPicture
      style={{ position: 'absolute', display: 'block', ...style }}
    />
  );
}

export function ImageView({ src, style }: { src: string; style?: CSSProperties }) {
  const ref = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    if (renderMode && ref.current) {
      const img = ref.current;
      track(img.complete ? img.decode().catch(() => {}) : new Promise((r) => (img.onload = img.onerror = r)));
    }
  }, [src]);
  return <img ref={ref} src={src} draggable={false} alt="" style={{ position: 'absolute', display: 'block', ...style }} />;
}

/** Audio de previsualización (la exportación mezcla el audio en el servidor). */
export function AudioView({ src, sourceTime, active, playing, rate = 1, volume = 1, enhance = false }: Omit<VideoProps, 'style'>) {
  const ref = useRef<HTMLAudioElement>(null);
  const attached = useRef(false);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.playbackRate = rate;
    routeAudio(a, attached, active && playing ? volume : 0, enhance);
    if (playing && active) {
      if (a.paused) {
        a.currentTime = sourceTime;
        a.play().catch(() => {});
      } else if (Math.abs(a.currentTime - sourceTime) > 0.2) a.currentTime = sourceTime;
    } else {
      if (!a.paused) a.pause();
      if (Math.abs(a.currentTime - sourceTime) > 0.05) a.currentTime = sourceTime;
    }
  });
  return <audio ref={ref} src={src} preload="auto" />;
}
