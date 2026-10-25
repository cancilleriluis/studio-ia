import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownToLine, BetweenHorizontalStart, Camera, ChevronsDownUp, Pause, Play, ScanLine, SkipBack, SkipForward } from 'lucide-react';
import type { Clip, KfProp, MediaClip, Transform } from '../../shared/types';
import { FORMATS, isVertical } from '../../shared/formats';
import { clipEnd, cutRange, liftRange, projectDuration } from '../../shared/ops';
import { isAnimated, setKey, transformAt } from '../../shared/keyframes';
import { Stage } from '../engine/Stage';
import { useEditor } from '../store';
import { api } from '../api';
import { formatTC } from './util';
import { SourceMonitor } from './SourceMonitor';

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Clip visual activo más alto en el instante t. */
function topClipAt(clips: Clip[], trackOrder: string[], t: number): Clip | undefined {
  return clips
    .filter((c) => c.type !== 'audio' && c.type !== 'effect' && c.start <= t && clipEnd(c) > t)
    .sort((a, b) => trackOrder.indexOf(a.trackId) - trackOrder.indexOf(b.trackId))[0];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Caja que ocupa el contenido de un clip, en px de pantalla relativos al marco del monitor. */
function measure(frame: HTMLElement, clip: Clip): Box | null {
  const layer = frame.querySelector(`[data-clip-id="${clip.id}"]`);
  if (!layer) return null;
  const fr = frame.getBoundingClientRect();
  const area = fr.width * fr.height;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (r: DOMRect) => {
    if (r.width < 1 || r.height < 1) return;
    x0 = Math.min(x0, r.left);
    y0 = Math.min(y0, r.top);
    x1 = Math.max(x1, r.right);
    y1 = Math.max(y1, r.bottom);
  };
  if (clip.type === 'video' || clip.type === 'image') {
    const m = layer.querySelector('video, img');
    if (m) add(m.getBoundingClientRect());
  } else {
    const all = layer.querySelectorAll('*');
    for (let i = 0; i < all.length && i < 400; i++) {
      const el = all[i] as HTMLElement;
      if (el.children.length && el.tagName !== 'svg') continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height > area * 0.95) continue;
      add(r);
    }
    if (x0 === Infinity) add(layer.getBoundingClientRect());
  }
  if (x0 === Infinity) return null;
  // Limitar al lienzo visible
  x0 = Math.max(x0, fr.left);
  y0 = Math.max(y0, fr.top);
  x1 = Math.min(x1, fr.right);
  y1 = Math.min(y1, fr.bottom);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0 - fr.left, y: y0 - fr.top, w: x1 - x0, h: y1 - y0 };
}

/** Asigna valores de transformación respetando los que están animados. */
function applyTransform(c: Clip & { transform: Transform }, local: number, v: Partial<Transform>) {
  for (const [k, val] of Object.entries(v) as [keyof Transform, number][]) {
    if (isAnimated(c, k as KfProp)) setKey(c, k as KfProp, local, val);
    else c.transform[k] = val;
  }
}

type DragMode = 'move' | 'scale' | 'rotate';

interface Drag {
  mode: DragMode;
  x: number;
  y: number;
  started: boolean;
  B?: { x: number; y: number };
  T0?: Transform;
}

function ProgramMonitor() {
  const project = useEditor((s) => s.project)!;
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const selection = useEditor((s) => s.selection);
  const safeZones = useEditor((s) => s.safeZones);
  const inPoint = useEditor((s) => s.inPoint);
  const outPoint = useEditor((s) => s.outPoint);
  const st = useEditor.getState();
  const [areaRef, area] = useSize<HTMLDivElement>();
  const frameRef = useRef<HTMLDivElement>(null);
  const { width: W, height: H } = FORMATS[project.format];
  const scale = area.w && area.h ? Math.min((area.w - 32) / W, (area.h - 32) / H) : 0.2;
  const dur = projectDuration(project);
  const drag = useRef<Drag | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [shooting, setShooting] = useState(false);

  const selected = selection.length === 1 ? project.clips.find((c) => c.id === selection[0]) : undefined;
  const movable = !!selected && (selected.type === 'template' || selected.type === 'video' || selected.type === 'image');
  const local = selected ? Math.min(selected.duration, Math.max(0, time - selected.start)) : 0;
  const visibleNow = !!selected && time >= selected.start && time < clipEnd(selected);
  const reframes =
    !!selected && (selected.type === 'video' || selected.type === 'image') && selected.fit === 'cover' && transformAt(selected, local).scale === 1 && !selected.crop;

  // Medir la caja de transformación tras cada pintado
  useLayoutEffect(() => {
    if (!movable || !visibleNow || !frameRef.current || !selected) {
      if (box) setBox(null);
      return;
    }
    const b = measure(frameRef.current, selected);
    if (!b) {
      if (box) setBox(null);
      return;
    }
    if (!box || Math.abs(b.x - box.x) > 0.5 || Math.abs(b.y - box.y) > 0.5 || Math.abs(b.w - box.w) > 0.5 || Math.abs(b.h - box.h) > 0.5) setBox(b);
  });

  const canvasPoint = (e: React.PointerEvent) => {
    const r = frameRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const startDrag = (e: React.PointerEvent, mode: DragMode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    st.pause();
    if (mode === 'move' && !movable) {
      const order = project.tracks.map((t) => t.id);
      const c = topClipAt(project.clips, order, time);
      st.select(c ? [c.id] : []);
      return;
    }
    const d: Drag = { mode, x: e.clientX, y: e.clientY, started: false };
    if (mode !== 'move' && box && selected && 'transform' in selected) {
      d.B = { x: (box.x + box.w / 2) / scale, y: (box.y + box.h / 2) / scale };
      d.T0 = transformAt(selected, local);
    }
    drag.current = d;
    frameRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !selected) return;
    const dx = (e.clientX - d.x) / scale;
    const dy = (e.clientY - d.y) / scale;
    if (!d.started) {
      if (Math.hypot(dx, dy) < 2) return;
      d.started = true;
      st.beginTransient();
    }
    const P = canvasPoint(e);
    st.transient((p) => {
      const c = p.clips.find((x) => x.id === selected.id);
      if (!c || !('transform' in c)) return;
      if (d.mode === 'move') {
        if (reframes) {
          const m = c as MediaClip;
          const a = p.assets.find((x) => x.id === m.assetId);
          const fr = { x: 0.5, y: 0.5, zoom: 1, ...(m.framing[p.format] ?? {}) };
          const sw = a?.width || W;
          const sh = a?.height || H;
          const s = Math.max(W / sw, H / sh) * fr.zoom;
          m.framing[p.format] = { ...fr, x: Math.min(1, Math.max(0, fr.x - dx / (sw * s))), y: Math.min(1, Math.max(0, fr.y - dy / (sh * s))) };
        } else {
          const cur = transformAt(c, local);
          applyTransform(c, local, { x: cur.x + dx / W, y: cur.y + dy / H });
        }
        return;
      }
      // Escalar / rotar alrededor del centro de la caja: T1 = (B−C) − M·(B−C−T0)
      const B = d.B!;
      const T0 = d.T0!;
      const C = { x: W / 2, y: H / 2 };
      const P0 = { x: (d.x - frameRef.current!.getBoundingClientRect().left) / scale, y: (d.y - frameRef.current!.getBoundingClientRect().top) / scale };
      let k = 1;
      let delta = 0;
      if (d.mode === 'scale') {
        k = Math.max(0.02, Math.hypot(P.x - B.x, P.y - B.y) / Math.max(1, Math.hypot(P0.x - B.x, P0.y - B.y)));
      } else {
        delta = ((Math.atan2(P.y - B.y, P.x - B.x) - Math.atan2(P0.y - B.y, P0.x - B.x)) * 180) / Math.PI;
        if (e.shiftKey) delta = Math.round((T0.rotation + delta) / 15) * 15 - T0.rotation;
      }
      const rad = (delta * Math.PI) / 180;
      const vx = B.x - C.x - T0.x * W;
      const vy = B.y - C.y - T0.y * H;
      const mx = k * (Math.cos(rad) * vx - Math.sin(rad) * vy);
      const my = k * (Math.sin(rad) * vx + Math.cos(rad) * vy);
      applyTransform(c, local, {
        x: (B.x - C.x - mx) / W,
        y: (B.y - C.y - my) / H,
        scale: Math.min(8, T0.scale * k),
        rotation: T0.rotation + delta,
      });
    });
  };

  const onPointerUp = () => {
    if (drag.current?.started) st.endTransient();
    drag.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!movable || !selected || !e.altKey) return;
    const f = Math.exp(-e.deltaY * 0.002);
    st.commit((p) => {
      const c = p.clips.find((x) => x.id === selected.id);
      if (!c || !('transform' in c)) return;
      if (reframes) {
        const m = c as MediaClip;
        const fr = { x: 0.5, y: 0.5, zoom: 1, ...(m.framing[p.format] ?? {}) };
        m.framing[p.format] = { ...fr, zoom: Math.min(5, Math.max(1, fr.zoom * f)) };
      } else applyTransform(c, local, { scale: Math.min(8, Math.max(0.05, transformAt(c, local).scale * f)) });
    });
  };

  const snapshot = async () => {
    setShooting(true);
    try {
      const r = await api.frame(project.id, time, project.format);
      st.notify('Fotograma guardado en exportaciones');
      api.reveal(r.file).catch(() => {});
    } catch (e: any) {
      st.notify(String(e.message), 'error');
    } finally {
      setShooting(false);
    }
  };

  const vertical = isVertical(project.format);
  const handle = (cursor: string, style: React.CSSProperties, mode: DragMode) => (
    <div className="gz-handle" style={{ cursor, ...style }} onPointerDown={(e) => startDrag(e, mode)} />
  );

  return (
    <>
      <div className="monitor-area" ref={areaRef}>
        <div
          className="stage-frame"
          ref={frameRef}
          style={{ width: W * scale, height: H * scale }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: W, height: H }}>
            <Stage project={project} time={time} playing={playing} />
          </div>
          <div className={`stage-overlay ${movable ? 'can-drag' : ''}`} onPointerDown={(e) => startDrag(e, 'move')} onWheel={onWheel}>
            {safeZones &&
              (vertical ? (
                <>
                  <div className="safe-ui" style={{ left: 0, right: 0, top: 0, height: '8%' }}>Cabecera</div>
                  <div className="safe-ui" style={{ left: 0, right: 0, bottom: 0, height: '20%' }}>Descripción y audio</div>
                  <div className="safe-ui" style={{ right: 0, width: '15%', top: '42%', height: '38%' }}>Botones</div>
                </>
              ) : (
                <>
                  <div className="safe-zone" style={{ left: '5%', right: '5%', top: '5%', bottom: '5%' }} />
                  <div className="safe-zone" style={{ left: '10%', right: '10%', top: '10%', bottom: '10%', opacity: 0.6 }} />
                </>
              ))}
            {box && !playing && (
              <div className="sel-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
                {handle('nwse-resize', { left: -5, top: -5 }, 'scale')}
                {handle('nesw-resize', { right: -5, top: -5 }, 'scale')}
                {handle('nesw-resize', { left: -5, bottom: -5 }, 'scale')}
                {handle('nwse-resize', { right: -5, bottom: -5 }, 'scale')}
                <div className="gz-stem" />
                <div className="gz-rotate" title="Rotar (⇧ en pasos de 15°)" onPointerDown={(e) => startDrag(e, 'rotate')} />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="transport">
        <button className="icon-btn" title="Inicio (Home)" onClick={() => st.setTime(0)}>
          <SkipBack size={16} />
        </button>
        <button className="play-btn" title="Reproducir / pausa (Espacio)" onClick={st.toggle}>
          {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <button className="icon-btn" title="Final (End)" onClick={() => st.setTime(dur)}>
          <SkipForward size={16} />
        </button>
        <div className="timecode">
          {formatTC(time, project.fps)} <span className="dur">/ {formatTC(dur, project.fps)}</span>
        </div>
        <div className="io-group">
          <button className={`btn sm ghost ${inPoint !== null ? 'io-on' : ''}`} title="Marcar entrada (I)" onClick={() => st.set({ inPoint: time })}>
            {'{'}
          </button>
          <button className={`btn sm ghost ${outPoint !== null ? 'io-on' : ''}`} title="Marcar salida (O)" onClick={() => st.set({ outPoint: time })}>
            {'}'}
          </button>
          {inPoint !== null && outPoint !== null && outPoint > inPoint && (
            <>
              <span className="hint">{formatTC(outPoint - inPoint, project.fps)}</span>
              <button className="icon-btn sm" title="Levantar (;) · deja el hueco" onClick={() => st.commit((p) => liftRange(p, inPoint, outPoint))}>
                <ArrowDownToLine size={14} />
              </button>
              <button
                className="icon-btn sm"
                title="Extraer (') · quita el tramo y cierra el hueco"
                onClick={() => {
                  st.commit((p) => cutRange(p, inPoint, outPoint));
                  st.set({ inPoint: null, outPoint: null });
                  st.setTime(inPoint);
                }}
              >
                <ChevronsDownUp size={14} />
              </button>
            </>
          )}
          {(inPoint !== null || outPoint !== null) && (
            <button className="btn sm ghost" title="Borrar marcas (⌥X)" onClick={() => st.set({ inPoint: null, outPoint: null })}>
              ✕
            </button>
          )}
        </div>
        <div className="spacer" />
        <span className="hint">
          {movable
            ? reframes
              ? 'Arrastra: reencuadrar · esquinas: escalar · ⌥ rueda: zoom'
              : 'Arrastra: mover · esquinas: escalar · círculo: rotar'
            : `${W}×${H} · ${Math.round(scale * 100)}%`}
        </span>
        <button className="icon-btn" title="Exportar fotograma en PNG (miniatura)" disabled={shooting} onClick={snapshot}>
          <Camera size={16} />
        </button>
        <button className={`icon-btn ${safeZones ? 'active' : ''}`} title="Zonas seguras" onClick={() => st.set({ safeZones: !safeZones })}>
          <ScanLine size={16} />
        </button>
      </div>
    </>
  );
}

export function Monitor() {
  const mode = useEditor((s) => s.monitorMode);
  const source = useEditor((s) => s.source);
  const assetName = useEditor((s) => s.project?.assets.find((a) => a.id === s.source?.assetId)?.name);
  const set = useEditor((s) => s.set);
  return (
    <div className="monitor">
      <div className="monitor-tabs">
        <button className={mode === 'program' ? 'on' : ''} onClick={() => set({ monitorMode: 'program' })}>
          Programa
        </button>
        <button className={mode === 'source' ? 'on' : ''} disabled={!source} onClick={() => set({ monitorMode: 'source' })} title="Doble clic en un medio para abrirlo aquí">
          <BetweenHorizontalStart size={12} /> Origen{assetName ? `: ${assetName}` : ''}
        </button>
      </div>
      {mode === 'source' && source ? <SourceMonitor /> : <ProgramMonitor />}
    </div>
  );
}
