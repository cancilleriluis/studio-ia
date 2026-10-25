import { useEffect, useRef, useState } from 'react';
import { Pause, Play, ScanLine, SkipBack, SkipForward } from 'lucide-react';
import type { Clip, MediaClip } from '../../shared/types';
import { FORMATS, isVertical } from '../../shared/formats';
import { clipEnd, projectDuration } from '../../shared/ops';
import { Stage } from '../engine/Stage';
import { useEditor } from '../store';
import { formatTC } from './util';

function useSize<T extends HTMLElement>() {
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

export function Monitor() {
  const project = useEditor((s) => s.project)!;
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const selection = useEditor((s) => s.selection);
  const safeZones = useEditor((s) => s.safeZones);
  const st = useEditor.getState();
  const [areaRef, area] = useSize<HTMLDivElement>();
  const { width: W, height: H } = FORMATS[project.format];
  const scale = area.w && area.h ? Math.min((area.w - 32) / W, (area.h - 32) / H) : 0.2;
  const dur = projectDuration(project);
  const drag = useRef<{ x: number; y: number; started: boolean } | null>(null);

  const selected = selection.length === 1 ? project.clips.find((c) => c.id === selection[0]) : undefined;
  const movable = selected && (selected.type === 'template' || selected.type === 'video' || selected.type === 'image');
  const reframes = selected && (selected.type === 'video' || selected.type === 'image') && selected.fit === 'cover' && selected.transform.scale === 1;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    st.pause();
    if (!movable) {
      const order = project.tracks.map((t) => t.id);
      const c = topClipAt(project.clips, order, time);
      if (c) st.select([c.id]);
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, started: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !selected) return;
    const dx = (e.clientX - d.x) / scale;
    const dy = (e.clientY - d.y) / scale;
    if (!d.started) {
      if (Math.hypot(dx, dy) < 3) return;
      d.started = true;
      st.beginTransient();
    }
    st.transient((p) => {
      const c = p.clips.find((x) => x.id === selected.id);
      if (!c) return;
      if (reframes) {
        const m = c as MediaClip;
        const a = p.assets.find((x) => x.id === m.assetId);
        const fr = { x: 0.5, y: 0.5, zoom: 1, ...(m.framing[p.format] ?? {}) };
        const sw = a?.width || W;
        const sh = a?.height || H;
        const s = Math.max(W / sw, H / sh) * fr.zoom;
        m.framing[p.format] = {
          ...fr,
          x: Math.min(1, Math.max(0, fr.x - dx / (sw * s))),
          y: Math.min(1, Math.max(0, fr.y - dy / (sh * s))),
        };
      } else if ('transform' in c) {
        c.transform.x += dx / W;
        c.transform.y += dy / H;
      }
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
      if (!c) return;
      if (reframes) {
        const m = c as MediaClip;
        const fr = { x: 0.5, y: 0.5, zoom: 1, ...(m.framing[p.format] ?? {}) };
        m.framing[p.format] = { ...fr, zoom: Math.min(5, Math.max(1, fr.zoom * f)) };
      } else if ('transform' in c) c.transform.scale = Math.min(6, Math.max(0.1, c.transform.scale * f));
    });
  };

  const vertical = isVertical(project.format);

  return (
    <div className="monitor">
      <div className="monitor-area" ref={areaRef}>
        <div className="stage-frame" style={{ width: W * scale, height: H * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: W, height: H }}>
            <Stage project={project} time={time} playing={playing} />
          </div>
          <div
            className={`stage-overlay ${movable ? 'can-drag' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
          >
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
        <div className="spacer" />
        <span className="hint">
          {movable
            ? reframes
              ? 'Arrastra para reencuadrar · ⌥ + rueda para zoom'
              : 'Arrastra para mover · ⌥ + rueda para escalar'
            : `${W}×${H} · ${Math.round(scale * 100)}%`}
        </span>
        <button className={`icon-btn ${safeZones ? 'active' : ''}`} title="Zonas seguras" onClick={() => st.set({ safeZones: !safeZones })}>
          <ScanLine size={16} />
        </button>
      </div>
    </div>
  );
}
