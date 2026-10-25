import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  AudioWaveform,
  Eye,
  EyeOff,
  Lock,
  Magnet,
  MousePointer2,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Type,
  Unlock,
  Volume2,
  VolumeX,
  Wand2,
  ZoomIn,
} from 'lucide-react';
import type { Asset, Clip, MediaClip, Project, Track } from '../../shared/types';
import {
  EPS,
  addTrack,
  clipEnd,
  createMediaClip,
  findFreeTrack,
  deleteClips,
  isFree,
  maxSourceDuration,
  projectDuration,
  splitAt,
  splitClip,
  trimClip,
} from '../../shared/ops';
import { getTemplate, getEffect } from '../../shared/registry';
import { keyTimes, moveKeysAt, removeKey } from '../../shared/keyframes';
import { mediaFileUrl } from '../engine/media';
import { useEditor } from '../store';
import { CLIP_COLORS, addAssetAt, addEffectAt, addTemplateAt, formatTC, removeSilences } from './util';
import { Meters } from './Meters';

const RULER_H = 26;
const CAP_H = 30;
const trackH = (t: Track) => (t.kind === 'visual' ? 62 : 52);
export const DRAG_MIME = 'application/x-studio';

/* ───────── Miniaturas y forma de onda ───────── */

const Filmstrip = memo(function Filmstrip({ projectId, asset, clip, zoom, width, height }: { projectId: string; asset: Asset; clip: MediaClip; zoom: number; width: number; height: number }) {
  const fs = asset.filmstrip;
  if (!fs) return null;
  const th = height;
  const tw = (fs.tileW / fs.tileH) * th;
  const n = Math.min(Math.ceil(width / tw), 160);
  const url = mediaFileUrl(projectId, fs.file);
  const items = [];
  for (let i = 0; i < n; i++) {
    const x = i * tw;
    const srcT = clip.in + ((x + tw / 2) / zoom) * clip.speed;
    const idx = Math.max(0, Math.min(fs.count - 1, Math.floor(srcT / fs.interval)));
    items.push(
      <div
        key={i}
        style={{
          width: tw,
          height: th,
          flex: 'none',
          backgroundImage: `url("${url}")`,
          backgroundSize: `${fs.cols * tw}px auto`,
          backgroundPosition: `${-(idx % fs.cols) * tw}px ${-Math.floor(idx / fs.cols) * th}px`,
        }}
      />,
    );
  }
  return <div className="clip-strip">{items}</div>;
});

const Waveform = memo(function Waveform({ assetId, inPoint, speed, zoom, width, height, color, gain }: { assetId: string; inPoint: number; speed: number; zoom: number; width: number; height: number; color: string; gain: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wave = useEditor((s) => s.waveforms[assetId]);
  const ensure = useEditor((s) => s.ensureWaveform);
  useEffect(() => {
    if (!wave) ensure(assetId);
  }, [assetId, wave, ensure]);
  const cw = Math.min(Math.max(1, Math.round(width)), 8000);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || !wave) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = cw * dpr;
    c.height = height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, height);
    ctx.fillStyle = color;
    const k = width / cw;
    const mid = height / 2;
    for (let x = 0; x < cw; x++) {
      const t0 = inPoint + ((x * k) / zoom) * speed;
      const t1 = inPoint + (((x + 1) * k) / zoom) * speed;
      const i0 = Math.floor(t0 * wave.rate);
      const i1 = Math.max(i0 + 1, Math.ceil(t1 * wave.rate));
      let m = 0;
      for (let i = i0; i < i1 && i < wave.peaks.length; i++) if (wave.peaks[i] > m) m = wave.peaks[i];
      const h = Math.min(1, Math.pow(m * gain, 0.7)) * mid * 0.95;
      if (h > 0.3) ctx.fillRect(x, mid - h, 1, h * 2);
    }
  }, [wave, cw, height, inPoint, speed, zoom, width, color, gain]);
  return <canvas ref={ref} className="clip-wave" style={{ width, height }} />;
});

/* ───────── Clip ───────── */

interface ClipViewProps {
  clip: Clip;
  project: Project;
  zoom: number;
  height: number;
  selected: boolean;
  razor: boolean;
  onPointerDown: (e: React.PointerEvent, clip: Clip, mode: 'move' | 'l' | 'r') => void;
  onKeyPointerDown: (e: React.PointerEvent, clip: Clip, t: number) => void;
}

const ClipView = memo(function ClipView({ clip, project, zoom, height, selected, razor, onPointerDown, onKeyPointerDown }: ClipViewProps) {
  const left = clip.start * zoom;
  const width = Math.max(4, clip.duration * zoom);
  const color = CLIP_COLORS[clip.type];
  const asset = 'assetId' in clip ? project.assets.find((a) => a.id === clip.assetId) : undefined;
  let label = clip.name ?? '';
  let icon = null;
  if (clip.type === 'template') {
    label = getTemplate(clip.template)?.name ?? clip.template;
    const txt = clip.props.title ?? clip.props.text;
    if (txt) label += ` · ${String(txt).slice(0, 40)}`;
    icon = <Sparkles size={11} />;
  } else if (clip.type === 'effect') {
    label = getEffect(clip.effect)?.name ?? clip.effect;
    icon = <Wand2 size={11} />;
  } else if (asset) label = asset.name;
  const inner = height - 6;
  const bg =
    clip.type === 'effect'
      ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${color} 55%, #15161a) 0 8px, color-mix(in srgb, ${color} 42%, #15161a) 8px 16px)`
      : `color-mix(in srgb, ${color} 45%, #15161a)`;
  return (
    <div
      className={`clip ${selected ? 'selected' : ''} ${razor ? 'razor' : ''}`}
      data-clip-id={clip.id}
      style={{ left, width, background: bg, borderColor: `color-mix(in srgb, ${color} 70%, transparent)` }}
      onPointerDown={(e) => onPointerDown(e, clip, 'move')}
      onDoubleClick={() => useEditor.getState().set({ rightTab: 'inspector' })}
      onContextMenu={(e) => {
        e.preventDefault();
        const s = useEditor.getState();
        if (!s.selection.includes(clip.id)) s.select([clip.id]);
        s.set({ ctxMenu: { x: e.clientX, y: e.clientY, clipId: clip.id } });
      }}
    >
      {asset && clip.type === 'video' && asset.filmstrip && (
        <Filmstrip projectId={project.id} asset={asset} clip={clip} zoom={zoom} width={width} height={inner} />
      )}
      {asset && clip.type === 'image' && (
        <div className="clip-strip" style={{ backgroundImage: `url("${mediaFileUrl(project.id, asset.proxy ?? asset.file)}")`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x', opacity: 0.7 }} />
      )}
      {asset && (clip.type === 'video' || clip.type === 'audio') && asset.hasAudio && asset.waveform && (
        <Waveform
          assetId={asset.id}
          inPoint={clip.in}
          speed={clip.speed}
          zoom={zoom}
          width={width}
          height={clip.type === 'audio' ? inner : Math.round(inner * 0.42)}
          color={clip.type === 'audio' ? 'rgba(200,255,225,.75)' : 'rgba(190,215,255,.85)'}
          gain={Math.max(0.05, clip.volume)}
        />
      )}
      {(clip.type === 'video' || clip.type === 'image') && clip.transitionIn && (
        <div className="clip-trans" style={{ width: Math.max(6, (clip.transitionIn.duration / 2) * zoom) }} title="Transición de entrada" />
      )}
      <div className="clip-label">
        {icon}
        {width > 40 ? label : ''}
      </div>
      {selected &&
        keyTimes(clip).map((t) => (
          <div
            key={t}
            className="kf-dot"
            style={{ left: t * zoom }}
            title="Fotograma clave · arrastra para moverlo · ⌥ clic para borrarlo"
            onPointerDown={(e) => {
              e.stopPropagation();
              onKeyPointerDown(e, clip, t);
            }}
          />
        ))}
      {!razor && (
        <>
          <div className="clip-handle l" onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, clip, 'l'); }} />
          <div className="clip-handle r" onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, clip, 'r'); }} />
        </>
      )}
    </div>
  );
});

/* ───────── Regla ───────── */

const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function Ruler({ zoom, scrollLeft, viewW, fps, markers, onScrub }: { zoom: number; scrollLeft: number; viewW: number; fps: number; markers: Project['markers']; onScrub: (e: React.PointerEvent) => void }) {
  const step = STEPS.find((s) => s * zoom >= 80) ?? 600;
  const minor = step / 5;
  const t0 = Math.floor(scrollLeft / zoom / step) * step;
  const t1 = (scrollLeft + viewW) / zoom + step;
  const ticks = [];
  for (let t = t0; t <= t1; t += minor) {
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    ticks.push(
      <div key={t.toFixed(3)} className="tl-tick" style={{ left: t * zoom, height: major ? 10 : 5 }}>
        {major && <span className="tl-tick-label">{step < 1 ? formatTC(t, fps) : formatTC(t, fps).slice(0, 5)}</span>}
      </div>,
    );
  }
  return (
    <div className="tl-ruler" onPointerDown={onScrub}>
      {ticks}
      {markers.map((m) => (
        <div
          key={m.id}
          className="marker"
          style={{ left: m.time * zoom, top: 14, background: m.color ?? '#ffb547' }}
          title={`${m.label} (⌥ clic para borrar)`}
          onPointerDown={(e) => {
            e.stopPropagation();
            const st = useEditor.getState();
            if (e.altKey) st.commit((p) => (p.markers = p.markers.filter((x) => x.id !== m.id)));
            else st.setTime(m.time);
          }}
        />
      ))}
    </div>
  );
}

function Playhead({ zoom, scrollRef }: { zoom: number; scrollRef: React.RefObject<HTMLDivElement> }) {
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const x = time * zoom;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    if (x > el.scrollLeft + el.clientWidth - 60 || x < el.scrollLeft) el.scrollLeft = x - 120;
  }, [x, playing, scrollRef]);
  return <div className="playhead" style={{ left: x }} />;
}

function IORange({ zoom }: { zoom: number }) {
  const i = useEditor((s) => s.inPoint);
  const o = useEditor((s) => s.outPoint);
  if (i === null && o === null) return null;
  const a = i ?? 0;
  const b = o ?? a;
  if (b <= a) return <div className="tl-io" style={{ left: a * zoom, width: 2 }} />;
  return <div className="tl-io" style={{ left: a * zoom, width: (b - a) * zoom }} />;
}

/* ───────── Línea de tiempo ───────── */

interface DragState {
  mode: 'move' | 'l' | 'r' | 'scrub' | 'key';
  keyT?: number;
  startX: number;
  startY: number;
  clipId: string;
  originals: { id: string; start: number; trackId: string }[];
  lastValid: number;
  started: boolean;
}

export function Timeline() {
  const project = useEditor((s) => s.project)!;
  const zoom = useEditor((s) => s.zoom);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const snapping = useEditor((s) => s.snapping);
  const st = useEditor.getState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headsRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ left: 0, w: 1000 });
  const [snapX, setSnapX] = useState<number | null>(null);
  const [dropTrack, setDropTrack] = useState<string | null>(null);
  const drag = useRef<DragState | null>(null);
  const dur = projectDuration(project);
  const contentW = Math.max((dur + 20) * zoom, scroll.w + 200);
  const selSet = useMemo(() => new Set(selection), [selection]);

  const onScroll = () => {
    const el = scrollRef.current!;
    if (headsRef.current) headsRef.current.scrollTop = el.scrollTop;
    setScroll({ left: el.scrollLeft, w: el.clientWidth });
  };
  useEffect(() => {
    onScroll();
    const ro = new ResizeObserver(onScroll);
    ro.observe(scrollRef.current!);
    return () => ro.disconnect();
  }, []);

  // Zoom con pellizco / ⌘ + rueda, centrado en el puntero
  useEffect(() => {
    const el = scrollRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const s = useEditor.getState();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const tAt = (el.scrollLeft + px) / s.zoom;
      const z = Math.min(800, Math.max(4, s.zoom * Math.exp(-e.deltaY * 0.01)));
      s.set({ zoom: z });
      requestAnimationFrame(() => (el.scrollLeft = tAt * z - px));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const timeAtClient = (clientX: number) => {
    const el = scrollRef.current!;
    return (clientX - el.getBoundingClientRect().left + el.scrollLeft) / useEditor.getState().zoom;
  };

  const snapCandidates = useCallback(
    (exclude: Set<string>) => {
      const p = useEditor.getState().project!;
      const c = [0, useEditor.getState().time, ...p.markers.map((m) => m.time)];
      for (const cl of p.clips) if (!exclude.has(cl.id)) c.push(cl.start, clipEnd(cl));
      return c;
    },
    [],
  );

  const snap = (t: number, cands: number[]): [number, number | null] => {
    if (!useEditor.getState().snapping) return [t, null];
    const thr = 8 / useEditor.getState().zoom;
    let best: number | null = null;
    for (const c of cands) if (Math.abs(c - t) < thr && (best === null || Math.abs(c - t) < Math.abs(best - t))) best = c;
    return best === null ? [t, null] : [best, best];
  };

  const trackAtClient = (clientY: number): string | null => {
    const el = document.elementsFromPoint(scrollRef.current!.getBoundingClientRect().left + 5, clientY).find((x) => (x as HTMLElement).dataset?.trackId);
    return (el as HTMLElement | undefined)?.dataset.trackId ?? null;
  };

  const onClipPointerDown = useCallback((e: React.PointerEvent, clip: Clip, mode: 'move' | 'l' | 'r') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = useEditor.getState();
    s.pause();
    const p = s.project!;
    if (p.tracks.find((t) => t.id === clip.trackId)?.locked) return;
    if (s.tool === 'razor') {
      const t = timeAtClient(e.clientX);
      const [ts] = e.shiftKey ? [t, null] : snap(t, [s.time]);
      if (e.altKey) s.commit((d) => splitAt(d, ts));
      else s.commit((d) => splitClip(d, clip.id, ts));
      return;
    }
    let sel = s.selection;
    if (e.shiftKey || e.metaKey) {
      s.select([clip.id], true);
      sel = useEditor.getState().selection;
    } else if (!sel.includes(clip.id)) {
      s.select([clip.id]);
      sel = [clip.id];
    }
    const ids = mode === 'move' ? sel : [clip.id];
    drag.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      clipId: clip.id,
      originals: p.clips.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id, start: c.start, trackId: c.trackId })),
      lastValid: 0,
      started: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onKeyPointerDown = useCallback((e: React.PointerEvent, clip: Clip, t: number) => {
    if (e.button !== 0) return;
    const s = useEditor.getState();
    s.pause();
    if (e.altKey) {
      s.commit((p) => {
        const c = p.clips.find((x) => x.id === clip.id);
        if (c) (['x', 'y', 'scale', 'rotation', 'opacity', 'volume'] as const).forEach((k) => removeKey(c, k, t));
      });
      return;
    }
    drag.current = { mode: 'key', keyT: t, startX: e.clientX, startY: e.clientY, clipId: clip.id, originals: [], lastValid: 0, started: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = useEditor.getState();
    if (d.mode === 'scrub') {
      s.setTime(Math.max(0, timeAtClient(e.clientX)));
      return;
    }
    if (d.mode === 'key') {
      const dx = e.clientX - d.startX;
      if (!d.started) {
        if (Math.abs(dx) < 3) return;
        d.started = true;
        s.beginTransient();
      }
      s.transient((p) => {
        const c = p.clips.find((x) => x.id === d.clipId);
        if (c) moveKeysAt(c, d.keyT!, Math.min(c.duration, Math.max(0, d.keyT! + dx / s.zoom)));
      });
      return;
    }
    const dx = e.clientX - d.startX;
    if (!d.started) {
      if (Math.abs(dx) < 3 && Math.abs(e.clientY - d.startY) < 3) return;
      d.started = true;
      s.beginTransient();
    }
    const exclude = new Set(d.originals.map((o) => o.id));
    const cands = snapCandidates(exclude);
    const base = s.project!;
    const main = base.clips.find((c) => c.id === d.clipId)!;
    const orig = d.originals.find((o) => o.id === d.clipId)!;

    if (d.mode === 'move') {
      let delta = dx / s.zoom;
      // Imán sobre el inicio o el final del clip principal
      const [sStart, hitA] = snap(orig.start + delta, cands);
      const [sEnd, hitB] = snap(orig.start + delta + main.duration, cands);
      if (hitA !== null) delta = sStart - orig.start;
      else if (hitB !== null) delta = sEnd - main.duration - orig.start;
      setSnapX(hitA ?? hitB);
      const minStart = Math.min(...d.originals.map((o) => o.start));
      delta = Math.max(delta, -minStart);
      // Cambio de pista (solo un clip)
      let targetTrack: string | null = null;
      if (d.originals.length === 1) {
        const tid = trackAtClient(e.clientY);
        const tr = base.tracks.find((t) => t.id === tid);
        const kind = main.type === 'audio' ? 'audio' : 'visual';
        if (tr && tr.kind === kind && !tr.locked) targetTrack = tr.id;
      }
      s.transient((p) => {
        const apply = (dl: number) => {
          for (const o of d.originals) {
            const c = p.clips.find((x) => x.id === o.id)!;
            c.start = o.start + dl;
            if (targetTrack && o.id === d.clipId) c.trackId = targetTrack;
            else c.trackId = o.trackId;
          }
          return d.originals.every((o) => {
            const c = p.clips.find((x) => x.id === o.id)!;
            return isFree(p, c.trackId, c.start, c.duration, [...exclude]);
          });
        };
        if (apply(delta)) d.lastValid = delta;
        else if (!apply(d.lastValid)) {
          targetTrack = null;
          apply(d.lastValid);
        }
      });
    } else {
      const t = d.mode === 'l' ? orig.start + dx / s.zoom : orig.start + main.duration + dx / s.zoom;
      const [ts, hit] = snap(t, cands);
      setSnapX(hit);
      s.transient((p) => trimClip(p, d.clipId, d.mode === 'l' ? 'start' : 'end', ts));
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setSnapX(null);
    if (d?.mode === 'key' && !d.started) {
      const c = useEditor.getState().project!.clips.find((x) => x.id === d.clipId);
      if (c) useEditor.getState().setTime(c.start + d.keyT!);
    }
    if (d?.started) useEditor.getState().endTransient();
  };

  const onScrub = (e: React.PointerEvent) => {
    st.pause();
    drag.current = { mode: 'scrub', startX: e.clientX, startY: e.clientY, clipId: '', originals: [], lastValid: 0, started: true };
    st.setTime(Math.max(0, timeAtClient(e.clientX)));
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDrop = (e: React.DragEvent, track: Track) => {
    e.preventDefault();
    setDropTrack(null);
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    const item = JSON.parse(raw) as { kind: string; id: string; in?: number; out?: number };
    const [t] = snap(Math.max(0, timeAtClient(e.clientX)), snapCandidates(new Set()));
    if (item.kind === 'asset') {
      const a = project.assets.find((x) => x.id === item.id);
      const wantAudio = a?.type === 'audio';
      if (item.in !== undefined && item.out !== undefined && a) {
        const trackOk = (track.kind === 'audio') === wantAudio;
        let id = '';
        st.commit((p) => {
          const c = createMediaClip(p, a, t, trackOk ? track.id : undefined);
          c.in = item.in!;
          c.duration = Math.max(0.1, item.out! - item.in!);
          if (!isFree(p, c.trackId, c.start, c.duration, [c.id])) c.trackId = findFreeTrack(p, c.type === 'audio' ? 'audio' : 'visual', c.start, c.duration);
          id = c.id;
        });
        st.select([id]);
      } else addAssetAt(item.id, t, (track.kind === 'audio') === wantAudio ? track.id : undefined);
    } else if (item.kind === 'template') addTemplateAt(item.id, t, track.kind === 'visual' ? track.id : undefined);
    else if (item.kind === 'effect') addEffectAt(item.id, t, track.kind === 'visual' ? track.id : undefined);
    else if (item.kind === 'transition') {
      const target = project.clips.find((c) => c.trackId === track.id && (c.type === 'video' || c.type === 'image') && c.start <= t + 0.5 && clipEnd(c) > t);
      if (target) st.commit((p) => {
        const c = p.clips.find((x) => x.id === target.id) as MediaClip;
        c.transitionIn = { type: item.id as any, duration: 0.6 };
      });
    }
  };

  const selClip = selection.length === 1 ? project.clips.find((c) => c.id === selection[0]) : undefined;
  const canSilence = selClip && (selClip.type === 'video' || selClip.type === 'audio');
  const visualCount = project.tracks.filter((t) => t.kind === 'visual').length;
  const audioCount = project.tracks.length - visualCount;

  return (
    <div className="timeline" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <div className="tl-toolbar">
        <button className={`icon-btn ${tool === 'select' ? 'active' : ''}`} title="Selección (V)" onClick={() => st.set({ tool: 'select' })}>
          <MousePointer2 size={15} />
        </button>
        <button className={`icon-btn ${tool === 'razor' ? 'active' : ''}`} title="Cuchilla (C) · ⌥ clic corta todas las pistas" onClick={() => st.set({ tool: 'razor' })}>
          <Scissors size={15} />
        </button>
        <div style={{ width: 1, height: 18, background: 'var(--line-2)', margin: '0 4px' }} />
        <button className="btn sm ghost" title="Cortar en el cabezal (S / ⌘K)" onClick={() => st.commit((p) => splitAt(p, st.time, st.selection))}>
          <Scissors size={13} /> Cortar
        </button>
        <button className="btn sm ghost" title="Borrar (⌫) · ⇧⌫ cierra el hueco" disabled={!selection.length} onClick={() => { st.commit((p) => deleteClips(p, st.selection, false)); st.select([]); }}>
          <Trash2 size={13} /> Borrar
        </button>
        <button className="btn sm ghost" title="Borrar y cerrar hueco (⇧⌫)" disabled={!selection.length} onClick={() => { st.commit((p) => deleteClips(p, st.selection, true)); st.select([]); }}>
          <ArrowLeftRight size={13} /> Ripple
        </button>
        <button className="btn sm ghost" disabled={!canSilence} title="Detecta las pausas y las corta (jump cuts)" onClick={() => selClip && removeSilences(selClip.id)}>
          <AudioWaveform size={13} /> Quitar silencios
        </button>
        <div className="spacer" />
        <span className="hint">Q/W recorta al cabezal · M marcador</span>
        <button className={`icon-btn ${snapping ? 'active' : ''}`} title="Imán" onClick={() => st.set({ snapping: !snapping })}>
          <Magnet size={15} />
        </button>
        <ZoomIn size={14} color="var(--faint)" />
        <input type="range" min={0} max={1} step={0.001} value={Math.log(zoom / 4) / Math.log(200)} onChange={(e) => st.set({ zoom: 4 * Math.pow(200, Number(e.target.value)) })} style={{ width: 110 }} />
        <button className="btn sm ghost" title="Ajustar todo" onClick={() => st.set({ zoom: Math.max(4, Math.min(800, (scroll.w - 60) / Math.max(1, dur))) })}>
          Ajustar
        </button>
      </div>
      <div className="tl-body">
        <div className="tl-heads" ref={headsRef}>
          <div style={{ height: RULER_H, borderBottom: '1px solid var(--line)' }} />
          <div className="tl-head" style={{ height: CAP_H }}>
            <Type size={12} />
            <span className="name" style={{ marginLeft: 6 }}>Subtítulos</span>
            <button className="icon-btn sm" title="Mostrar / ocultar subtítulos" onClick={() => st.commit((p) => (p.captions.enabled = !p.captions.enabled))}>
              {project.captions.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          </div>
          {project.tracks.map((t) => {
            const empty = !project.clips.some((c) => c.trackId === t.id);
            const removable = empty && (t.kind === 'visual' ? visualCount > 1 : audioCount > 1);
            return (
              <div key={t.id} className="tl-head" style={{ height: trackH(t) }}>
                <span className="name">{t.name}</span>
                {removable && (
                  <button className="icon-btn sm" title="Eliminar pista vacía" onClick={() => st.commit((p) => (p.tracks = p.tracks.filter((x) => x.id !== t.id)))}>
                    <Trash2 size={12} />
                  </button>
                )}
                {t.kind === 'visual' ? (
                  <button className="icon-btn sm" title="Ocultar pista" onClick={() => st.commit((p) => { const x = p.tracks.find((y) => y.id === t.id)!; x.hidden = !x.hidden; })}>
                    {t.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                ) : null}
                <button className="icon-btn sm" title="Silenciar pista" onClick={() => st.commit((p) => { const x = p.tracks.find((y) => y.id === t.id)!; x.muted = !x.muted; })}>
                  {t.muted ? <VolumeX size={13} color="var(--danger)" /> : <Volume2 size={13} />}
                </button>
                <button className="icon-btn sm" title="Bloquear pista" onClick={() => st.commit((p) => { const x = p.tracks.find((y) => y.id === t.id)!; x.locked = !x.locked; })}>
                  {t.locked ? <Lock size={12} color="var(--accent)" /> : <Unlock size={12} />}
                </button>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 4, padding: 8 }}>
            <button className="btn sm" onClick={() => st.commit((p) => addTrack(p, 'visual'))}>
              <Plus size={12} /> V
            </button>
            <button className="btn sm" onClick={() => st.commit((p) => addTrack(p, 'audio'))}>
              <Plus size={12} /> A
            </button>
          </div>
        </div>
        <div className="tl-scroll" ref={scrollRef} onScroll={onScroll}>
          <div className="tl-canvas" style={{ width: contentW }}>
            <Ruler zoom={zoom} scrollLeft={scroll.left} viewW={scroll.w} fps={project.fps} markers={project.markers} onScrub={onScrub} />
            <div className="tl-track" style={{ height: CAP_H }}>
              {project.captions.segments.map((s) => (
                <div
                  key={s.id}
                  className="cap-seg"
                  style={{ left: s.start * zoom, width: Math.max(3, (s.end - s.start) * zoom - 1), opacity: project.captions.enabled ? 1 : 0.4 }}
                  title={s.text}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    st.setTime(s.start);
                    st.set({ leftTab: 'captions' });
                  }}
                >
                  {s.text}
                </div>
              ))}
            </div>
            {project.tracks.map((t) => (
              <div
                key={t.id}
                data-track-id={t.id}
                className={`tl-track ${t.kind} ${t.locked ? 'locked' : ''} ${dropTrack === t.id ? 'drop' : ''}`}
                style={{ height: trackH(t) }}
                onPointerDown={(e) => {
                  if (e.button === 0 && !e.shiftKey) st.select([]);
                }}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(DRAG_MIME)) {
                    e.preventDefault();
                    setDropTrack(t.id);
                  }
                }}
                onDragLeave={() => setDropTrack(null)}
                onDrop={(e) => onDrop(e, t)}
              >
                {project.clips
                  .filter((c) => c.trackId === t.id)
                  .map((c) => (
                    <ClipView
                      key={c.id}
                      clip={c}
                      project={project}
                      zoom={zoom}
                      height={trackH(t)}
                      selected={selSet.has(c.id)}
                      razor={tool === 'razor'}
                      onPointerDown={onClipPointerDown}
                      onKeyPointerDown={onKeyPointerDown}
                    />
                  ))}
              </div>
            ))}
            <IORange zoom={zoom} />
            <Playhead zoom={zoom} scrollRef={scrollRef} />
            {snapX !== null && <div className="snap-line" style={{ left: snapX * zoom }} />}
          </div>
        </div>
        <Meters />
      </div>
    </div>
  );
}

