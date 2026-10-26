// Compositor: dibuja el proyecto en el instante `time`. Se usa igual en el
// monitor del editor y en la exportación fotograma a fotograma.

import { memo, useMemo, type CSSProperties } from 'react';
import type { Asset, AudioClip, Clip, EffectClip, FormatId, MediaClip, Project, TemplateClip, TransitionId } from '../../shared/types';
import { FORMATS, isVertical, unitScale } from '../../shared/formats';
import { clipGainAt, voiceRegions } from '../../shared/audio';
import { animStyle, clamp, ease, envelope, lerp, noise1, prog } from './anim';
import { AudioView, ImageView, VideoView, assetUrl } from './media';
import { Captions } from './Captions';
import { renderMode } from './renderSync';
import { TEMPLATE_COMPONENTS } from '../templates';
import { transformAt } from '../../shared/keyframes';
import { cropRect, mediaRect } from './geometry';
import { GradedMedia } from './GradedMedia';
import { isGradeActive } from '../../shared/grade';

interface StageProps {
  project: Project;
  format?: FormatId;
  time: number;
  playing: boolean;
  captions?: boolean;
}

interface Layer {
  clip: Clip;
  ti: number;
  visible: boolean;
  next?: Clip;
}

const LOOKAHEAD = renderMode ? 0.04 : 2.5;
const isVisualMedia = (c: Clip): c is MediaClip => c.type === 'video' || c.type === 'image';

export const Stage = memo(function Stage({ project, format, time, playing, captions = true }: StageProps) {
  const fid = format ?? project.format;
  const { width: W, height: H } = FORMATS[fid];
  const u = unitScale(fid);
  const vertical = isVertical(fid);
  const regions = useMemo(() => voiceRegions(project), [project]);
  const assets = useMemo(() => new Map(project.assets.map((a) => [a.id, a])), [project.assets]);

  const layers: Layer[] = [];
  const visual = project.tracks.filter((t) => t.kind === 'visual').reverse();
  visual.forEach((tr, ti) => {
    if (tr.hidden) return;
    const clips = project.clips.filter((c) => c.trackId === tr.id).sort((a, b) => a.start - b.start);
    clips.forEach((c, i) => {
      const end = c.start + c.duration;
      const pre = isVisualMedia(c) && c.transitionIn ? c.transitionIn.duration / 2 : 0;
      const nx = clips[i + 1];
      const post = nx && isVisualMedia(nx) && nx.transitionIn && Math.abs(nx.start - end) < 0.05 ? nx.transitionIn.duration / 2 : 0;
      const look = c.type === 'effect' ? 0 : LOOKAHEAD;
      const visible = time >= c.start - pre && time < end + post;
      if (time >= c.start - pre - look && time < end + post + 0.25) layers.push({ clip: c, ti, visible, next: post ? nx : undefined });
    });
  });
  const activeFx = layers.filter((l) => l.visible && l.clip.type === 'effect').sort((a, b) => a.ti - b.ti);

  return (
    <div className="stage" style={{ position: 'relative', width: W, height: H, overflow: 'hidden', background: project.background }}>
      {layers.map((l) => {
        const c = l.clip;
        if (c.type === 'effect') return l.visible ? <EffectOverlay key={c.id} clip={c} time={time} u={u} /> : null;
        const fx = composeEffects(activeFx.filter((e) => e.ti > l.ti).map((e) => e.clip as EffectClip), time, W, H, u);
        const trackMuted = project.tracks.find((t) => t.id === c.trackId)?.muted;
        return (
          <div
            key={c.id}
            data-clip-id={c.id}
            style={{
              position: 'absolute',
              inset: 0,
              visibility: l.visible ? 'visible' : 'hidden',
              transformOrigin: '0 0',
              transform: fx.transform || undefined,
              filter: fx.filter || undefined,
            }}
          >
            {isVisualMedia(c) ? (
              <MediaContent
                clip={c}
                asset={assets.get(c.assetId)}
                projectId={project.id}
                time={time}
                visible={l.visible}
                playing={playing}
                W={W}
                H={H}
                u={u}
                format={fid}
                next={l.next as MediaClip | undefined}
                volume={trackMuted ? 0 : clipGainAt(project, c, time, regions)}
                lutFile={c.grade?.lut ? assets.get(c.grade.lut)?.file : undefined}
              />
            ) : c.type === 'template' ? (
              <TemplateContent
                clip={c}
                project={project}
                time={time}
                visible={l.visible}
                playing={playing}
                W={W}
                H={H}
                u={u}
                format={fid}
                vertical={vertical}
              />
            ) : null}
          </div>
        );
      })}
      {captions && <Captions project={project} t={time} W={W} H={H} u={u} />}
      {!renderMode && <AudioLayers project={project} time={time} playing={playing} regions={regions} />}
    </div>
  );
});

/* ───────── Medios (vídeo / imagen) ───────── */

function inTransition(type: TransitionId, p: number, W: number, H: number, u: number): { style: CSSProperties; overlay?: CSSProperties } {
  const e = ease.outCubic(p);
  switch (type) {
    case 'fade':
      return { style: { opacity: p } };
    case 'dip-black':
    case 'dip-white':
      return {
        style: { opacity: p < 0.5 ? 0 : 1 },
        overlay: { background: type === 'dip-black' ? '#000' : '#fff', opacity: 1 - Math.abs(2 * p - 1) },
      };
    case 'zoom':
      return { style: { opacity: clamp(p * 2), transform: `scale(${lerp(1.35, 1, e)})` } };
    case 'slide-left':
      return { style: { transform: `translateX(${(1 - e) * W}px)` } };
    case 'slide-up':
      return { style: { transform: `translateY(${(1 - e) * H}px)` } };
    case 'blur':
      return { style: { opacity: p, filter: `blur(${(1 - p) * 34 * u}px)` } };
    case 'whip': {
      const w = ease.inOutCubic(p);
      return { style: { transform: `translateX(${(1 - w) * W}px)`, filter: `blur(${Math.sin(p * Math.PI) * 26 * u}px)` } };
    }
  }
}

function outTransition(type: TransitionId, p: number, W: number, H: number, u: number): CSSProperties {
  const e = ease.outCubic(p);
  switch (type) {
    case 'zoom':
      return { transform: `scale(${lerp(1, 1.25, e)})` };
    case 'slide-left':
      return { transform: `translateX(${-e * W}px)` };
    case 'slide-up':
      return { transform: `translateY(${-e * H}px)` };
    case 'blur':
      return { filter: `blur(${p * 34 * u}px)` };
    case 'whip': {
      const w = ease.inOutCubic(p);
      return { transform: `translateX(${-w * W}px)`, filter: `blur(${Math.sin(p * Math.PI) * 26 * u}px)` };
    }
    default:
      return {};
  }
}

function MediaContent({
  clip: c,
  asset,
  projectId,
  time,
  visible,
  playing,
  W,
  H,
  u,
  format,
  next,
  volume,
  lutFile,
}: {
  lutFile?: string;
  clip: MediaClip;
  asset?: Asset;
  projectId: string;
  time: number;
  visible: boolean;
  playing: boolean;
  W: number;
  H: number;
  u: number;
  format: FormatId;
  next?: MediaClip;
  volume: number;
}) {
  if (!asset) return null;
  const local = time - c.start;
  const { left, top, width: dw, height: dh } = mediaRect(c, asset, format, W, H, local);

  const col = c.color;
  const filter = col ? `brightness(${col.brightness}) contrast(${col.contrast}) saturate(${col.saturation})` : undefined;
  const mediaStyle: CSSProperties = { left, top, width: dw, height: dh, filter };

  let tStyle: CSSProperties = {};
  let overlay: CSSProperties | undefined;
  if (c.transitionIn && local < c.transitionIn.duration / 2) {
    const d = c.transitionIn.duration;
    const r = inTransition(c.transitionIn.type, prog(time, c.start - d / 2, c.start + d / 2), W, H, u);
    tStyle = r.style;
    overlay = r.overlay;
  } else if (next?.transitionIn && time > c.start + c.duration - next.transitionIn.duration / 2) {
    const d = next.transitionIn.duration;
    const end = c.start + c.duration;
    tStyle = outTransition(next.transitionIn.type, prog(time, end - d / 2, end + d / 2), W, H, u);
  }

  const tr = transformAt(c, local);
  const sc = Math.max(0.01, tr.scale);
  const wrap: CSSProperties = {
    position: 'absolute',
    inset: 0,
    transform: `translate(${tr.x * W}px, ${tr.y * H}px) rotate(${tr.rotation}deg) scale(${tr.scale})`,
    opacity: tr.opacity,
    filter: c.shadow ? `drop-shadow(0 ${(24 * u) / sc}px ${(60 * u) / sc}px rgba(0,0,0,${0.7 * c.shadow}))` : undefined,
  };
  // Recorte y esquinas (picture-in-picture). Radio y borde constantes tras escalar.
  // El recorte se mide sobre el propio medio: «arriba» solo quita la parte de arriba.
  const rad = ((c.radius ?? 0) * u) / sc;
  const hasBox = !!(c.crop || c.radius || c.border?.width);
  const box = cropRect({ left, top, width: dw, height: dh }, c.crop, W, H);
  const clipPath = hasBox
    ? `inset(${box.top}px ${W - box.left - box.width}px ${H - box.top - box.height}px ${box.left}px round ${rad}px)`
    : undefined;

  let media: React.ReactNode;
  if (isGradeActive(c.grade) && (asset.type === 'video' || asset.type === 'image')) {
    const st = clamp(c.in + local * c.speed, 0, Math.max(0, asset.duration - 0.04));
    media = (
      <GradedMedia
        kind={asset.type}
        src={assetUrl(projectId, asset)}
        sourceTime={st}
        active={visible}
        playing={playing}
        rate={c.speed}
        volume={volume}
        enhance={!!c.enhance}
        style={mediaStyle}
        grade={c.grade!}
        projectId={projectId}
        lutFile={lutFile}
        clipId={c.id}
      />
    );
  } else if (asset.type === 'video') {
    const st = clamp(c.in + local * c.speed, 0, Math.max(0, asset.duration - 0.04));
    media = (
      <VideoView src={assetUrl(projectId, asset)} sourceTime={st} active={visible} playing={playing} rate={c.speed} volume={volume} enhance={!!c.enhance} style={mediaStyle} />
    );
  } else {
    media = <ImageView src={assetUrl(projectId, asset)} style={mediaStyle} />;
  }

  return (
    <div style={wrap}>
      <div style={{ position: 'absolute', inset: 0, ...tStyle, clipPath }}>
        {media}
        {col && col.warmth !== 0 && (
          <div
            style={{
              position: 'absolute',
              left,
              top,
              width: dw,
              height: dh,
              background: col.warmth > 0 ? '#ff9a3c' : '#3c8cff',
              mixBlendMode: 'soft-light',
              opacity: Math.abs(col.warmth) * 0.7,
            }}
          />
        )}
      </div>
      {c.border?.width ? (
        <div
          style={{
            position: 'absolute',
            ...box,
            border: `${(c.border.width * u) / sc}px solid ${c.border.color}`,
            borderRadius: rad,
            boxSizing: 'border-box',
            ...tStyle,
          }}
        />
      ) : null}
      {overlay && <div style={{ position: 'absolute', inset: 0, ...overlay }} />}
    </div>
  );
}

/* ───────── Plantillas ───────── */

function TemplateContent({
  clip: c,
  project,
  time,
  visible,
  playing,
  W,
  H,
  u,
  format,
  vertical,
}: {
  clip: TemplateClip;
  project: Project;
  time: number;
  visible: boolean;
  playing: boolean;
  W: number;
  H: number;
  u: number;
  format: FormatId;
  vertical: boolean;
}) {
  const Comp = TEMPLATE_COMPONENTS[c.template];
  if (!Comp) return null;
  const local = Math.max(0, time - c.start);
  const { pin, pout } = envelope(local, c.duration, c.inDuration, c.outDuration);
  const tr = transformAt(c, local);
  const aIn = animStyle(c.animIn, pin, u);
  const aOut = animStyle(c.animOut, 1 - pout, u, true);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `translate(${tr.x * W}px, ${tr.y * H}px) rotate(${tr.rotation}deg) scale(${tr.scale})`,
        opacity: tr.opacity,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, ...aIn }}>
        <div style={{ position: 'absolute', inset: 0, ...aOut }}>
          <Comp
            props={c.props}
            t={local}
            dur={c.duration}
            W={W}
            H={H}
            u={u}
            pin={pin}
            pout={pout}
            format={format}
            vertical={vertical}
            projectId={project.id}
            assets={project.assets}
            playing={playing}
            visible={visible}
          />
        </div>
      </div>
    </div>
  );
}

/* ───────── Efectos (capas de ajuste) ───────── */

function ramp(local: number, dur: number, r: number) {
  if (r <= 0) return 1;
  return Math.min(ease.inOutCubic(prog(local, 0, r)), 1 - ease.inOutCubic(prog(local, dur - r, dur)));
}

export function composeEffects(effects: EffectClip[], time: number, W: number, H: number, u: number) {
  let transform = '';
  let filter = '';
  for (const e of effects) {
    const local = time - e.start;
    const p = e.props;
    switch (e.effect) {
      case 'zoom': {
        const env = p.snap ? 1 : ramp(local, e.duration, Math.min(p.ease ?? 0.35, e.duration / 2));
        const s = 1 + ((p.scale ?? 1.2) - 1) * env;
        const ox = (p.x ?? 0.5) * W;
        const oy = (p.y ?? 0.4) * H;
        transform = `translate(${ox}px, ${oy}px) scale(${s}) translate(${-ox}px, ${-oy}px) ${transform}`;
        break;
      }
      case 'shake': {
        const env = 1 - prog(local, 0, e.duration);
        const k = (p.intensity ?? 1) * env;
        const dx = noise1(time * 9, 1) * 24 * u * k;
        const dy = noise1(time * 9, 2) * 24 * u * k;
        const rot = noise1(time * 7, 3) * 0.9 * k;
        const sc = 1 + 0.05 * k;
        transform = `translate(${W / 2 + dx}px, ${H / 2 + dy}px) rotate(${rot}deg) scale(${sc}) translate(${-W / 2}px, ${-H / 2}px) ${transform}`;
        break;
      }
      case 'blur': {
        const env = ramp(local, e.duration, Math.min(0.3, e.duration / 2));
        filter += ` blur(${(p.amount ?? 18) * u * env}px) brightness(${1 - (p.dim ?? 0.25) * env})`;
        break;
      }
      case 'grade': {
        const env = ramp(local, e.duration, Math.min(0.3, e.duration / 2));
        const w = (p.warmth ?? 0) * env;
        filter += ` brightness(${lerp(1, p.brightness ?? 1, env)}) contrast(${lerp(1, p.contrast ?? 1, env)}) saturate(${lerp(1, p.saturation ?? 1, env)})`;
        if (w > 0) filter += ` sepia(${w * 0.35})`;
        if (w < 0) filter += ` hue-rotate(${w * 10}deg)`;
        break;
      }
    }
  }
  return { transform: transform.trim(), filter: filter.trim() };
}

function EffectOverlay({ clip: e, time, u }: { clip: EffectClip; time: number; u: number }) {
  const local = time - e.start;
  if (e.effect === 'flash') {
    const p = local / e.duration;
    const a = p < 0.2 ? ease.outCubic(p / 0.2) : 1 - ease.outCubic((p - 0.2) / 0.8);
    return <div style={{ position: 'absolute', inset: 0, background: e.props.color ?? '#fff', opacity: clamp(a), pointerEvents: 'none' }} />;
  }
  if (e.effect === 'vignette') {
    const env = ramp(local, e.duration, Math.min(0.4, e.duration / 2));
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,${(e.props.amount ?? 0.55) * env}) 100%)`,
          pointerEvents: 'none',
        }}
      />
    );
  }
  return null;
}

/* ───────── Audio de previsualización ───────── */

function AudioLayers({ project, time, playing, regions }: { project: Project; time: number; playing: boolean; regions: [number, number][] }) {
  const clips = project.clips.filter(
    (c): c is AudioClip =>
      c.type === 'audio' && time >= c.start - LOOKAHEAD && time < c.start + c.duration + 0.25 && !project.tracks.find((t) => t.id === c.trackId)?.muted,
  );
  return (
    <>
      {clips.map((c) => {
        const a = project.assets.find((x) => x.id === c.assetId);
        if (!a) return null;
        const active = time >= c.start && time < c.start + c.duration;
        const st = clamp(c.in + (time - c.start) * c.speed, 0, a.duration);
        return (
          <AudioView
            key={c.id}
            src={assetUrl(project.id, a)}
            sourceTime={st}
            active={active}
            playing={playing}
            rate={c.speed}
            volume={clipGainAt(project, c, time, regions)}
            enhance={!!c.enhance}
          />
        );
      })}
    </>
  );
}
