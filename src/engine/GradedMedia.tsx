// Medio (vídeo o imagen) con corrección de color WebGL. El elemento original
// sigue montado (sincronía, audio) pero invisible; lo que se ve es el lienzo.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Grade } from '../../shared/types';
import { GradeRenderer, loadLut, type LutData } from './grading';
import { ImageView, VideoView, lastSeek } from './media';
import { renderMode, track } from './renderSync';

interface Props {
  kind: 'video' | 'image';
  src: string;
  sourceTime: number;
  active: boolean;
  playing: boolean;
  rate?: number;
  volume?: number;
  enhance?: boolean;
  style: CSSProperties;
  grade: Grade;
  projectId: string;
  lutFile?: string;
  clipId: string;
}

export function GradedMedia(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<GradeRenderer | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const [lut, setLut] = useState<LutData | null>(null);
  const gradeRef = useRef(p.grade);
  gradeRef.current = p.grade;
  const lutRef = useRef(lut);
  lutRef.current = lut;

  // LUT
  const lutPromise = useRef<Promise<unknown>>(Promise.resolve());
  useLayoutEffect(() => {
    if (!p.lutFile) {
      setLut(null);
      return;
    }
    const pr = loadLut(p.projectId, p.lutFile).then(
      (d) => {
        lutRef.current = d;
        setLut(d);
      },
      () => setLut(null),
    );
    lutPromise.current = pr;
    track(pr);
  }, [p.projectId, p.lutFile]);

  const draw = () => {
    const el = p.kind === 'video' ? video.current : image.current;
    if (!el || !canvas.current) return;
    try {
      renderer.current ??= new GradeRenderer(canvas.current);
      renderer.current.render(el, gradeRef.current, p.grade.lut ? lutRef.current : null);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => () => renderer.current?.dispose(), []);

  // Dibujar tras cada cambio (en exportación, cuando el fotograma está listo)
  useLayoutEffect(() => {
    const el = p.kind === 'video' ? video.current : image.current;
    if (!el) return;
    if (renderMode) {
      const seek = lastSeek.get(el as HTMLMediaElement) ?? Promise.resolve();
      track(Promise.all([seek, lutPromise.current]).then(draw));
    } else draw();
  });

  // Vista previa: redibujar con cada fotograma nuevo del vídeo
  useEffect(() => {
    const el = p.kind === 'video' ? video.current : image.current;
    if (!el || renderMode) return;
    const on = () => draw();
    el.addEventListener(p.kind === 'video' ? 'seeked' : 'load', on);
    el.addEventListener('loadeddata', on);
    let handle = 0;
    const v = el as HTMLVideoElement;
    if (p.kind === 'video' && p.playing && 'requestVideoFrameCallback' in v) {
      const loop = () => {
        draw();
        handle = v.requestVideoFrameCallback(loop);
      };
      handle = v.requestVideoFrameCallback(loop);
    }
    return () => {
      el.removeEventListener(p.kind === 'video' ? 'seeked' : 'load', on);
      el.removeEventListener('loadeddata', on);
      if (handle) v.cancelVideoFrameCallback(handle);
    };
  }, [p.kind, p.playing, p.src]);

  const hidden: CSSProperties = { ...p.style, opacity: 0 };
  return (
    <>
      {p.kind === 'video' ? (
        <VideoView
          elRef={video}
          src={p.src}
          sourceTime={p.sourceTime}
          active={p.active}
          playing={p.playing}
          rate={p.rate}
          volume={p.volume}
          enhance={p.enhance}
          style={hidden}
        />
      ) : (
        <ImageView elRef={image} src={p.src} style={hidden} />
      )}
      <canvas ref={canvas} className="graded" data-graded={p.clipId} style={{ position: 'absolute', display: 'block', ...p.style }} />
    </>
  );
}
