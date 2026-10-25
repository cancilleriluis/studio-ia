// Monitor de origen, como en Premiere: previsualiza un medio, marca entrada (I)
// y salida (O) e insértalo (,) o sobrescribe (.) en el cabezal del programa.

import { useEffect, useRef, useState } from 'react';
import { FileAudio, GripVertical, Pause, Play, Replace, SquareArrowDown } from 'lucide-react';
import { placeSource } from '../../shared/ops';
import { assetUrl } from '../engine/media';
import { useEditor } from '../store';
import { useSize } from './Monitor';
import { DRAG_MIME } from './Timeline';
import { formatTC } from './util';

/** Controles que usan los atajos de teclado globales cuando el monitor de origen está activo. */
export const sourceControls: { toggle?: () => void; step?: (d: number) => void } = {};

export function openSource(assetId: string) {
  const st = useEditor.getState();
  const a = st.project?.assets.find((x) => x.id === assetId);
  if (!a || a.status !== 'ready') return;
  st.pause();
  st.set({ monitorMode: 'source', source: { assetId, time: 0, in: null, out: null } });
}

/** Coloca el tramo marcado del origen en el cabezal del programa. */
export function placeFromSource(mode: 'insert' | 'overwrite') {
  const st = useEditor.getState();
  const src = st.source;
  const a = st.project?.assets.find((x) => x.id === src?.assetId);
  if (!src || !a) {
    st.notify('Abre un medio en el monitor de origen (doble clic en Medios)', 'error');
    return;
  }
  const total = a.type === 'image' ? 5 : a.duration;
  const i = src.in ?? 0;
  const o = src.out ?? total;
  if (o - i < 0.05) {
    st.notify('La salida debe ir después de la entrada', 'error');
    return;
  }
  let id = '';
  try {
    st.commit((p) => (id = placeSource(p, a, i, o, st.time, mode, st.targetVideo, st.targetAudio)));
  } catch (e: any) {
    st.notify(String(e.message), 'error');
    return;
  }
  st.select([id]);
  st.setTime(st.time + (o - i));
  st.notify(`${mode === 'insert' ? 'Insertado' : 'Sobrescrito'}: ${formatTC(o - i, st.project!.fps)}`);
}

export function SourceMonitor() {
  const project = useEditor((s) => s.project)!;
  const source = useEditor((s) => s.source)!;
  const asset = project.assets.find((a) => a.id === source.assetId);
  const st = useEditor.getState();
  const [areaRef, area] = useSize<HTMLDivElement>();
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const total = asset ? (asset.type === 'image' ? 5 : asset.duration) : 1;

  const setSource = (patch: Partial<typeof source>) => {
    const cur = useEditor.getState().source;
    if (cur) useEditor.setState({ source: { ...cur, ...patch } });
  };

  // Reloj: mientras reproduce, el tiempo de origen sigue al elemento
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const m = media.current;
      if (m) {
        setSource({ time: m.currentTime });
        const out = useEditor.getState().source?.out;
        if (out !== null && out !== undefined && m.currentTime >= out) {
          m.pause();
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    const m = media.current;
    if (m && !playing && Math.abs(m.currentTime - source.time) > 0.01) m.currentTime = source.time;
  }, [source.time, playing]);

  useEffect(() => {
    sourceControls.toggle = () => {
      const m = media.current;
      if (!m) return;
      if (m.paused) {
        const s = useEditor.getState().source!;
        if (s.out !== null && s.time >= s.out - 0.02) m.currentTime = s.in ?? 0;
        m.play().catch(() => {});
        setPlaying(true);
      } else {
        m.pause();
        setPlaying(false);
      }
    };
    sourceControls.step = (d) => {
      media.current?.pause();
      setPlaying(false);
      const s = useEditor.getState().source!;
      setSource({ time: Math.min(total, Math.max(0, s.time + d)) });
    };
    return () => {
      sourceControls.toggle = undefined;
      sourceControls.step = undefined;
    };
  }, [total]);

  if (!asset) return <div className="empty">Medio no encontrado</div>;
  const ratio = (asset.width ?? 16) / (asset.height ?? 9);
  const boxW = Math.max(10, Math.min(area.w - 32, (area.h - 32) * ratio));
  const boxH = boxW / ratio;
  const pct = (t: number) => `${(t / total) * 100}%`;

  const scrub = (e: React.PointerEvent) => {
    const r = barRef.current!.getBoundingClientRect();
    const t = Math.min(total, Math.max(0, ((e.clientX - r.left) / r.width) * total));
    media.current?.pause();
    setPlaying(false);
    setSource({ time: t });
  };

  return (
    <>
      <div className="monitor-area" ref={areaRef}>
        <div className="stage-frame" style={{ width: boxW, height: boxH, background: '#000' }}>
          {asset.type === 'video' && (
            <video ref={media} src={assetUrl(project.id, asset)} style={{ width: '100%', height: '100%', display: 'block' }} preload="auto" playsInline />
          )}
          {asset.type === 'image' && <img src={assetUrl(project.id, asset)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />}
          {asset.type === 'audio' && (
            <div className="tpl-placeholder" style={{ gap: 8 }}>
              <FileAudio size={30} />
              <audio ref={media} src={assetUrl(project.id, asset)} preload="auto" />
            </div>
          )}
        </div>
      </div>
      <div className="source-bar" ref={barRef} onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); scrub(e); }} onPointerMove={(e) => e.buttons && scrub(e)}>
        {(source.in !== null || source.out !== null) && (
          <div className="source-range" style={{ left: pct(source.in ?? 0), width: `calc(${pct(source.out ?? total)} - ${pct(source.in ?? 0)})` }} />
        )}
        <div className="source-head" style={{ left: pct(source.time) }} />
      </div>
      <div className="transport">
        <button className="play-btn" title="Reproducir / pausa (Espacio)" onClick={() => sourceControls.toggle?.()}>
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <div className="timecode">
          {formatTC(source.time, project.fps)} <span className="dur">/ {formatTC(total, project.fps)}</span>
        </div>
        <div className="io-group">
          <button className={`btn sm ghost ${source.in !== null ? 'io-on' : ''}`} title="Marcar entrada (I)" onClick={() => setSource({ in: source.time })}>
            {'{'}
          </button>
          <button className={`btn sm ghost ${source.out !== null ? 'io-on' : ''}`} title="Marcar salida (O)" onClick={() => setSource({ out: source.time })}>
            {'}'}
          </button>
          <span className="hint">{formatTC((source.out ?? total) - (source.in ?? 0), project.fps)}</span>
        </div>
        <div className="spacer" />
        <div
          className="btn sm ghost"
          draggable
          title="Arrastra el tramo marcado a una pista"
          onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'asset', id: asset.id, in: source.in ?? 0, out: source.out ?? total }))}
        >
          <GripVertical size={13} /> Arrastrar
        </div>
        <button className="btn sm" title="Insertar en el cabezal desplazando lo demás (,)" onClick={() => placeFromSource('insert')}>
          <SquareArrowDown size={13} /> Insertar
        </button>
        <button className="btn sm" title="Sobrescribir en el cabezal (.)" onClick={() => placeFromSource('overwrite')}>
          <Replace size={13} /> Sobrescribir
        </button>
      </div>
    </>
  );
}
