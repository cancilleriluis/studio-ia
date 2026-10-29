import type { CSSProperties, ComponentType } from 'react';
import { MousePointer2 } from 'lucide-react';
import { clamp, ease, lerp, noise1, prog } from '../engine/anim';
import { LiquidChrome } from '../engine/LiquidChrome';
import { Anchor, ICON_MAP, PanelMedia, parseAccent, type TplProps } from './common';
import './templates.css';

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;

/* ───────────── Rótulo de vidrio ───────────── */
function GlassLowerThird({ props, t, W, H, u, vertical }: TplProps) {
  const s = (props.size ?? 1) * u;
  const enter = ease.outQuint(prog(t, 0, 0.75));
  const t1 = ease.outCubic(prog(t, 0.12, 0.62));
  const t2 = ease.outCubic(prog(t, 0.22, 0.75));
  const shine = ease.inOutCubic(prog(t, 0.45, 1.45));
  const Icon = props.icon && props.icon !== 'none' ? ICON_MAP[props.icon] : null;
  return (
    <div className="tpl-root">
      <Anchor position={props.position ?? 'bottom-left'} W={W} H={H} vertical={vertical}>
        <div
          className="glass-card"
          style={{
            ...cssVars({ '--blur': `${(props.blur ?? 22) * s}px`, '--u': s }),
            padding: `${24 * s}px ${34 * s}px ${26 * s}px`,
            borderRadius: 12 * s,
            transform: `translateY(${(1 - enter) * 34 * s}px) scale(${lerp(0.93, 1, enter)})`,
            opacity: clamp(enter * 1.4),
            filter: enter < 1 ? `blur(${(1 - enter) * 10 * s}px)` : undefined,
          }}
        >
          <div className="glass-tint" style={{ background: props.tint ?? '#ffffff' }} />
          <LiquidChrome
            width={160}
            height={100}
            time={t * 0.6}
            tint="#ffffff"
            seed={3.7}
            quality={1}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.16, mixBlendMode: 'overlay' }}
          />
          {props.chrome !== false && (
            <div className="chrome-edge" style={cssVars({ '--edge': `${2.6 * s}px`, '--angle': `${t * 50 + 20}deg` })} />
          )}
          <div className="glass-shine" style={{ left: `${lerp(-50, 130, shine)}%`, opacity: shine > 0 && shine < 1 ? 1 : 0 }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16 * s,
                transform: `translateY(${(1 - t1) * 22 * s}px)`,
                opacity: t1,
              }}
            >
              {Icon && <Icon size={58 * s} strokeWidth={2.4} />}
              <span style={{ fontSize: 74 * s, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1 }}>{props.title}</span>
            </div>
            {props.subtitle ? (
              <div
                style={{
                  fontSize: 46 * s,
                  fontWeight: 600,
                  letterSpacing: '-0.015em',
                  marginTop: 14 * s,
                  lineHeight: 1.05,
                  transform: `translateY(${(1 - t2) * 18 * s}px)`,
                  opacity: t2,
                }}
              >
                {props.subtitle}
              </div>
            ) : null}
          </div>
        </div>
      </Anchor>
    </div>
  );
}

/* ───────────── Pantalla dividida ───────────── */
function ChromeFrame({ u, children, frame }: { u: number; children: React.ReactNode; frame: string }) {
  const nub = 12 * u;
  return (
    <div className="chrome-frame" style={{ borderRadius: 3 * u }}>
      {children}
      {frame === 'chrome' && (
        <>
          <div className="chrome-edge" style={cssVars({ '--edge': `${5 * u}px`, '--angle': '30deg' })} />
          {[
            { left: -nub / 3, top: -nub / 3 },
            { right: -nub / 3, top: -nub / 3 },
            { left: -nub / 3, bottom: -nub / 3 },
            { right: -nub / 3, bottom: -nub / 3 },
          ].map((pos, i) => (
            <div key={i} className="frame-nub" style={{ ...pos, width: nub, height: nub }} />
          ))}
        </>
      )}
      {frame === 'white' && (
        <div style={{ position: 'absolute', inset: 0, border: `${6 * u}px solid #fff`, zIndex: 3 }} />
      )}
    </div>
  );
}

function SplitScreen(p: TplProps) {
  const { props, t, W, H, u, vertical } = p;
  const panels: any[] = (props.panels ?? []).slice(0, 2);
  const stacked = props.layout === 'vertical' || (props.layout === 'auto' && vertical);
  const labelSize = (stacked ? 76 : 66) * u;
  const gap = (stacked ? 70 : 52) * u;
  let pw: number;
  let ph: number;
  if (stacked) {
    pw = W * 0.84;
    ph = Math.min(pw / 1.33, (H * 0.78 - 2 * labelSize * 1.5 - gap) / 2);
  } else {
    pw = (W * 0.88 - gap) / 2;
    ph = Math.min(pw / 1.33, H * 0.72 - labelSize * 1.5);
  }
  const blockW = stacked ? pw : pw * 2 + gap;
  const blockH = stacked ? (ph + labelSize * 1.4) * 2 + gap : ph + labelSize * 1.4;
  const x0 = (W - blockW) / 2;
  const y0 = (H - blockH) / 2;
  const bgIn = ease.outCubic(prog(t, 0, 0.6));
  const bgAsset = p.assets.find((a) => a.id === props.background);

  return (
    <div className="tpl-root" style={{ background: props.bgColor ?? '#f4f5f7', opacity: bgIn }}>
      {bgAsset && (
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${lerp(1.08, 1, ease.outCubic(prog(t, 0, 2.5)))})` }}>
          <PanelMedia {...p} assetId={bgAsset.id} inPoint={0} />
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, background: props.bgColor ?? '#f4f5f7', opacity: props.bgFade ?? 0.55 }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, ${props.bgColor ?? '#f4f5f7'} 0%, transparent 35%, transparent 70%, ${props.bgColor ?? '#f4f5f7'} 100%)`,
          opacity: 0.85,
        }}
      />
      {props.grid !== false && (
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: 0.5 * bgIn }}>
          {[0.06, 0.94].map((x) => (
            <line key={x} x1={W * x} x2={W * x} y1={0} y2={H} stroke="rgba(0,0,0,.09)" strokeWidth={1.5 * u} />
          ))}
          {[0.12, 0.88].map((y) => (
            <line key={y} x1={0} x2={W} y1={H * y} y2={H * y} stroke="rgba(0,0,0,.09)" strokeWidth={1.5 * u} />
          ))}
        </svg>
      )}
      {panels.map((panel, i) => {
        const pi = ease.outCubic(prog(t, 0.12 + i * 0.16, 0.8 + i * 0.16));
        const pl = ease.outCubic(prog(t, 0.35 + i * 0.16, 0.9 + i * 0.16));
        const left = stacked ? x0 : x0 + i * (pw + gap);
        const top = stacked ? y0 + i * (ph + labelSize * 1.4 + gap) : y0;
        return (
          <div key={i} style={{ position: 'absolute', left, top, width: pw }}>
            <div
              style={{
                fontSize: labelSize,
                fontWeight: 900,
                letterSpacing: '-0.035em',
                lineHeight: 1,
                color: props.labelColor ?? '#1b1d22',
                height: labelSize * 1.4,
                textTransform: 'uppercase',
                clipPath: `inset(0 ${(1 - pl) * 100}% 0 0)`,
                transform: `translateX(${(1 - pl) * -20 * u}px)`,
              }}
            >
              {panel.label}
            </div>
            <div
              style={{
                position: 'relative',
                width: pw,
                height: ph,
                transform: `translateY(${(1 - pi) * 90 * u}px) scale(${lerp(0.95, 1, pi)})`,
                opacity: clamp(pi * 1.5),
                boxShadow: `0 ${30 * u}px ${70 * u}px rgba(0,0,0,${0.22 * pi})`,
              }}
            >
              <ChromeFrame u={u} frame={props.frame ?? 'chrome'}>
                <PanelMedia {...p} assetId={panel.assetId} inPoint={Number(panel.in) || 0} label={`Panel ${i + 1}`} />
              </ChromeFrame>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── Tríptico ───────────── */
function Badge({ text, dot, dotColor, u, style = 'white' }: { text: string; dot?: boolean; dotColor?: string; u: number; style?: string }) {
  const look: CSSProperties =
    style === 'dark'
      ? { background: '#111316', color: '#fff' }
      : style === 'glass'
        ? {
            background: 'rgba(255,255,255,.18)',
            color: '#fff',
            backdropFilter: `blur(${16 * u}px)`,
            WebkitBackdropFilter: `blur(${16 * u}px)`,
            border: `${1.5 * u}px solid rgba(255,255,255,.45)`,
          }
        : { background: '#f7f7f7', color: '#141414' };
  return (
    <div
      className="tpl-badge"
      style={{
        ...look,
        fontSize: 46 * u,
        padding: `${14 * u}px ${22 * u}px`,
        borderRadius: 6 * u,
        gap: 12 * u,
        boxShadow: `0 ${8 * u}px ${24 * u}px rgba(0,0,0,.25)`,
      }}
    >
      {dot && <span style={{ width: 16 * u, height: 16 * u, borderRadius: '50%', background: dotColor ?? '#f5b400' }} />}
      {text}
    </div>
  );
}

function Triptych(p: TplProps) {
  const { props, t, W, H, u, vertical } = p;
  const panels: any[] = (props.panels ?? []).slice(0, 3);
  const rows = props.layout === 'rows' || (props.layout === 'auto' && vertical);
  const line = 7 * u;
  const n = Math.max(1, panels.length);
  const size = ((rows ? H : W) - line * (n - 1)) / n;
  const titleP = ease.outCubic(prog(t, 0.45, 1.15));
  const barW = Math.min(W * (vertical ? 0.84 : 0.6), 1200 * u);
  const barH = 128 * u;
  return (
    <div className="tpl-root" style={{ background: '#fff' }}>
      {panels.map((panel, i) => {
        const pi = ease.outQuint(prog(t, i * 0.12, 0.7 + i * 0.12));
        const pb = ease.outBack(prog(t, 0.55 + i * 0.1, 0.95 + i * 0.1));
        const box: CSSProperties = rows
          ? { left: 0, width: W, top: i * (size + line), height: size }
          : { top: 0, height: H, left: i * (size + line), width: size };
        return (
          <div key={i} style={{ position: 'absolute', overflow: 'hidden', ...box, clipPath: `inset(${(1 - pi) * 100}% 0 0 0)` }}>
            <div style={{ position: 'absolute', inset: 0, transform: `scale(${lerp(1.18, 1, pi)})` }}>
              <PanelMedia {...p} assetId={panel.assetId} inPoint={Number(panel.in) || 0} label={`Panel ${i + 1}`} />
            </div>
            {panel.badge ? (
              <div
                style={{
                  position: 'absolute',
                  right: 34 * u,
                  bottom: (rows ? 30 : vertical ? 60 : 44) * u,
                  transform: `scale(${pb})`,
                  transformOrigin: 'right bottom',
                  opacity: clamp(pb * 2),
                }}
              >
                <Badge text={panel.badge} dot={panel.dot} dotColor={props.dotColor} u={u} />
              </div>
            ) : null}
          </div>
        );
      })}
      {props.title ? (
        <div
          style={{
            position: 'absolute',
            left: (W - barW) / 2,
            top: (vertical ? 0.09 : 0.05) * H,
            width: barW,
            height: barH,
            clipPath: `inset(0 ${(1 - titleP) * 100}% 0 0 round ${12 * u}px)`,
            filter: `drop-shadow(0 ${14 * u}px ${30 * u}px rgba(0,0,0,.35))`,
          }}
        >
          <LiquidChrome width={barW} height={barH} time={t} radius={12 * u} quality={0.5} style={{ position: 'absolute', inset: 0, width: barW, height: barH, opacity: 0.93 }} />
          <div
            style={{
              position: 'absolute',
              left: 22 * u,
              top: 18 * u,
              bottom: 18 * u,
              display: 'flex',
              alignItems: 'center',
              padding: `0 ${26 * u}px`,
              borderRadius: 999,
              border: `${2 * u}px solid rgba(255,255,255,.28)`,
              background: 'rgba(255,255,255,.06)',
              color: '#f4f5f7',
              fontSize: 84 * u,
              fontWeight: 750,
              letterSpacing: '-0.03em',
              textShadow: `0 ${2 * u}px ${4 * u}px rgba(0,0,0,.5), 0 0 ${20 * u}px rgba(0,0,0,.4)`,
            }}
          >
            {props.title}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ───────────── Paper (collage) ───────────── */
const svgBg = (svg: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
const noiseSvg = (size: number, freq: number, octaves: number, matrix: string) =>
  svgBg(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${octaves}' stitchTiles='stitch'/><feColorMatrix values='${matrix}'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
  );
/** Grano fino y manchas grandes de papel (negro con alfa sacado del ruido). */
const GRAIN = noiseSvg(256, 0.9, 2, '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.12 0 0 0 0');
const SHEET_GRAIN = noiseSvg(256, 0.9, 2, '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.05 0 0 0 0');
const CRUMPLE = noiseSvg(700, 0.012, 3, '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.22 0 0 0 -0.09');
const PAPER_TEXTURE = `${GRAIN}, ${CRUMPLE}`;
const SERIF = '"Times New Roman", Times, Georgia, serif';

interface MarkRun {
  words: string[];
  mark: boolean;
}

/** Agrupa las palabras entre *asteriscos* en tramos marcados (con sus espacios internos). */
function markRuns(text: string): MarkRun[] {
  const parts = parseAccent(text);
  const runs: MarkRun[] = [];
  parts.forEach((w, i) => {
    const space = /^\s+$/.test(w.word);
    const mark = space ? !!(parts[i - 1]?.accent && parts[i + 1]?.accent) : w.accent;
    const last = runs[runs.length - 1];
    if (last && last.mark === mark) last.words.push(w.word);
    else runs.push({ words: [w.word], mark });
  });
  return runs;
}

/** Tiempo que tarda en dibujarse un tramo marcado, según su longitud. */
const runDuration = (r: MarkRun) => clamp(0.25 + r.words.join('').length * 0.022, 0.35, 0.9);

/** Instantes de inicio de cada tramo marcado y fin de todos. */
function markSchedule(runs: MarkRun[], start: number) {
  const starts: number[] = [];
  let at = start;
  for (const r of runs) {
    if (!r.mark) continue;
    starts.push(at);
    at += runDuration(r) + 0.15;
  }
  return { starts, end: starts.length ? at - 0.15 : start };
}

function MarkedText({ runs, starts, t, mark, accent, fs }: { runs: MarkRun[]; starts: number[]; t: number; mark: string; accent: string; fs: number }) {
  let k = 0;
  return (
    <>
      {runs.map((run, ri) => {
        if (!run.mark) return <span key={ri}>{run.words.join('')}</span>;
        const s0 = starts[k++];
        const d = runDuration(run);
        if (mark === 'circle') {
          const p = ease.inOutSine(prog(t, s0, s0 + d * 1.2));
          return (
            <span key={ri} style={{ position: 'relative', display: 'inline-block', whiteSpace: 'nowrap' }}>
              {run.words.join('')}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ position: 'absolute', left: '-5%', width: '110%', top: '-24%', height: '148%', overflow: 'visible' }}
              >
                <path
                  d="M 86 16 C 66 0, 18 4, 6 32 C -4 62, 22 98, 56 94 C 92 90, 106 58, 94 30 C 88 16, 72 8, 50 10"
                  fill="none"
                  stroke={accent}
                  strokeWidth={fs * 0.07}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - p}
                  opacity={p > 0 ? 1 : 0}
                />
              </svg>
            </span>
          );
        }
        // Rotulador y subrayado: cada palabra se dibuja a su turno para que el trazo avance de corrido.
        const total = run.words.join('').length || 1;
        let c0 = 0;
        return (
          <span key={ri}>
            {run.words.map((w, wi) => {
              const a = c0 / total;
              c0 += w.length;
              const p = prog(t, s0 + d * a, s0 + (d * c0) / total);
              if (mark === 'underline') {
                return (
                  <span key={wi} style={{ position: 'relative' }}>
                    {w}
                    <svg
                      viewBox="0 0 100 10"
                      preserveAspectRatio="none"
                      style={{ position: 'absolute', left: 0, width: '100%', top: '88%', height: '0.3em', overflow: 'visible' }}
                    >
                      <path
                        d={`M 0 ${5 + (wi % 2 ? 1.5 : -1)} Q 50 ${wi % 2 ? 2 : 8} 100 ${5 + (wi % 2 ? -1 : 1.5)}`}
                        fill="none"
                        stroke={accent}
                        strokeWidth={fs * 0.075}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        pathLength={1}
                        strokeDasharray={1}
                        strokeDashoffset={1 - p}
                        opacity={p > 0 ? 1 : 0}
                      />
                    </svg>
                  </span>
                );
              }
              return (
                <span
                  key={wi}
                  style={{
                    backgroundImage: `linear-gradient(${accent}, ${accent})`,
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: `${p * 100}% 58%`,
                    backgroundPosition: '0 78%',
                    mixBlendMode: 'multiply',
                  }}
                >
                  {w}
                </span>
              );
            })}
          </span>
        );
      })}
    </>
  );
}

/** Pseudoaleatorio estable a partir de un entero. */
const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function Halftone({ style, dot }: { style: CSSProperties; dot: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        backgroundImage: `radial-gradient(circle, rgba(70,70,70,.5) 36%, transparent 40%)`,
        backgroundSize: `${dot}px ${dot}px`,
        WebkitMaskImage: 'radial-gradient(ellipse at center, #000 25%, transparent 70%)',
        maskImage: 'radial-gradient(ellipse at center, #000 25%, transparent 70%)',
        ...style,
      }}
    />
  );
}

function Paper(p: TplProps) {
  const { props, t, dur, W, H, u, vertical } = p;
  const accent = props.accent ?? '#f5a524';
  const mark = props.mark ?? 'marker';
  const stop = props.stopMotion !== false;
  const titleRuns = markRuns(props.title ?? '');
  const absRuns = markRuns(props.abstract ?? '');
  const absHasMarks = absRuns.some((r) => r.mark);

  // Guion: caída de la hoja → acercamiento al título → marcas del título → nota → (resumen).
  const titleSched = markSchedule(titleRuns, 1.0);
  const absStart = titleSched.end + (absHasMarks ? 0.75 : 0);
  const absSched = markSchedule(absRuns, absStart);
  const needed = absSched.end + 0.6;
  const sp = Math.max(1, needed / Math.max(1, dur - 0.5)); // comprime el guion si el clip es corto
  const tc = t * sp; // tiempo continuo (cámara)
  const tq = (stop ? Math.floor(t * 12) / 12 : t) * sp; // tiempo a 12 fps (elementos del collage)
  const boil = stop ? Math.floor(t * 6) : 0;
  const jitter = (seed: number, amp: number) => (stop ? noise1(boil * 0.731 + seed, seed) * amp : 0);

  // Hoja A4 centrada; todo se maqueta en unidades de diseño (1000 de ancho) y se escala con ps.
  const PW = Math.min(W * 0.84, (H * 0.88) / 1.414);
  const PH = PW * 1.414;
  const ps = PW / 1000;
  const px0 = (W - PW) / 2;
  const py0 = (H - PH) / 2;
  const pad = 80;
  const titleFs = 66;
  const absFs = 22;

  // Posición estimada (en la hoja) del centro del título y del resumen, para la cámara.
  const titleLen = String(props.title ?? '').replace(/\*/g, '').length;
  const titleLines = Math.max(1, Math.ceil((titleLen * titleFs * 0.5) / (1000 - pad * 2)));
  const titleTop = pad + 70;
  const titleH = titleLines * titleFs * 1.12;
  const authorLines = String(props.authors ?? '').split('\n').length;
  const absTop = titleTop + titleH + 40 + authorLines * 36 + 70;
  const absLen = String(props.abstract ?? '').replace(/\*/g, '').length;
  const absH = Math.ceil((absLen * absFs * 0.46) / (1000 - pad * 2 - 80)) * absFs * 1.45;
  const focusTitle = (titleTop + titleH / 2) * ps;
  const focusAbs = (absTop + absH / 2) * ps;

  const zoom = props.zoom ?? 1.45;
  const k1 = ease.inOutCubic(prog(tc, 0.55, 1.4));
  const k2 = absHasMarks ? ease.inOutCubic(prog(tc, absStart - 0.75, absStart - 0.05)) : 0;
  const fy = lerp(lerp(H / 2, py0 + focusTitle, k1), py0 + focusAbs, k2);
  // En vertical el foco queda algo por encima del centro, en la zona libre de arriba.
  const fyScreen = lerp(H / 2, H * (vertical ? 0.42 : 0.5), k1);
  const cs = lerp(1, zoom, k1) * (1 + 0.025 * clamp(t / Math.max(0.01, dur)));

  const drop = ease.outBack(prog(tq, 0.05, 0.6));
  const tilt = props.tilt ?? -2.5;
  const bgIn = ease.outCubic(prog(tc, 0, 0.3));
  const noteP = ease.outBack(prog(tq, titleSched.end - 0.1, titleSched.end + 0.3));

  const imgAsset = p.assets.find((a) => a.id === props.image);
  const imgP = ease.outBack(prog(tq, 0.35, 0.8));
  const iw = PW * 0.5;
  const ih = imgAsset?.width && imgAsset?.height ? iw * Math.min(1.4, imgAsset.height / imgAsset.width) : iw * 0.7;
  const ob = 7 * ps;
  const outline = (c: string, b: number) =>
    `drop-shadow(${b}px 0 0 ${c}) drop-shadow(-${b}px 0 0 ${c}) drop-shadow(0 ${b}px 0 ${c}) drop-shadow(0 -${b}px 0 ${c})`;

  const bg = props.background ?? 'paper';
  const lines = (col: number) =>
    Array.from({ length: 40 }, (_, i) => {
      const r = hash(col * 100 + i);
      const end = i % 7 === 6;
      return end ? 0.3 + r * 0.45 : 0.9 + r * 0.1;
    });

  return (
    <div className="tpl-root">
      {bg === 'paper' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#ebe7df',
            backgroundImage: `radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(60,45,30,.16)), ${PAPER_TEXTURE}`,
            backgroundSize: `100% 100%, ${256 * u}px ${256 * u}px, ${700 * u}px ${700 * u}px`,
          }}
        />
      )}
      {bg === 'dim' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', opacity: bgIn }} />}

      {/* Cámara: lleva el punto de foco al centro y acerca. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformOrigin: '0 0',
          transform: `translate(${W / 2}px, ${fyScreen}px) scale(${cs}) translate(${-W / 2}px, ${-fy}px)`,
        }}
      >
        {props.halftone !== false && (
          <>
            <Halftone
              dot={18 * ps}
              style={{ left: px0 - PW * 0.16, top: py0 + PH * 0.04, width: PW * 0.55, height: PH * 0.32, opacity: bgIn }}
            />
            <Halftone
              dot={18 * ps}
              style={{ left: px0 + PW * 0.6, top: py0 + PH * 0.66, width: PW * 0.6, height: PH * 0.38, opacity: bgIn }}
            />
          </>
        )}

        {/* La hoja */}
        <div
          style={{
            position: 'absolute',
            left: px0,
            top: py0,
            width: PW,
            height: PH,
            transform: `translate(${jitter(1, 1.5 * u)}px, ${(1 - drop) * H * 0.55 + jitter(2, 1.5 * u)}px) rotate(${tilt + (1 - drop) * -9 + jitter(3, 0.3)}deg) scale(${lerp(1.08, 1, drop)})`,
            opacity: clamp(prog(tq, 0.05, 0.12) * 10),
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              backgroundColor: '#fbfaf6',
              backgroundImage: `linear-gradient(100deg, rgba(0,0,0,.035), transparent 30%, transparent 75%, rgba(0,0,0,.05)), ${SHEET_GRAIN}`,
              backgroundSize: `100% 100%, ${256 * ps}px ${256 * ps}px`,
              boxShadow: `0 ${18 * ps}px ${50 * ps}px rgba(40,30,20,.28), 0 ${2 * ps}px ${4 * ps}px rgba(40,30,20,.18)`,
              color: '#141414',
              fontFamily: SERIF,
              padding: `${pad * ps}px`,
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 19 * ps,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#666',
                borderBottom: `${1.5 * ps}px solid #cfcac0`,
                paddingBottom: 14 * ps,
                height: 30 * ps,
                boxSizing: 'content-box',
              }}
            >
              <span>{props.source}</span>
              <span style={{ fontFamily: '"JetBrains Mono Variable", monospace', letterSpacing: 0 }}>PREPRINT</span>
            </div>
            <div
              style={{
                marginTop: 26 * ps,
                fontFamily: `"${props.font ?? 'Playfair Display Variable'}", ${SERIF}`,
                fontSize: titleFs * ps,
                fontWeight: 700,
                lineHeight: 1.12,
                letterSpacing: '-0.015em',
                textAlign: 'center',
                whiteSpace: 'pre-line',
              }}
            >
              <MarkedText runs={titleRuns} starts={titleSched.starts} t={tq} mark={mark} accent={accent} fs={titleFs * ps} />
            </div>
            <div style={{ marginTop: 40 * ps, fontSize: 24 * ps, lineHeight: 1.5, fontStyle: 'italic', textAlign: 'center', color: '#333', whiteSpace: 'pre-line' }}>
              {props.authors}
            </div>
            {props.abstract ? (
              <div style={{ margin: `${46 * ps}px ${40 * ps}px 0` }}>
                <div style={{ fontSize: 22 * ps, fontWeight: 700, textAlign: 'center', marginBottom: 12 * ps }}>Abstract</div>
                <div style={{ fontSize: absFs * ps, lineHeight: 1.45, textAlign: 'justify', hyphens: 'auto', whiteSpace: 'pre-line' }}>
                  {/* En el resumen las frases son largas y ocupan varias líneas: el círculo pasa a subrayado. */}
                  <MarkedText runs={absRuns} starts={absSched.starts} t={tq} mark={mark === 'circle' ? 'underline' : mark} accent={accent} fs={absFs * ps} />
                </div>
              </div>
            ) : null}
            {/* Cuerpo de relleno a dos columnas */}
            <div style={{ display: 'flex', gap: 44 * ps, marginTop: 50 * ps }}>
              {[0, 1].map((col) => (
                <div key={col} style={{ flex: 1 }}>
                  {col === 0 && <div style={{ fontSize: 22 * ps, fontWeight: 700, marginBottom: 16 * ps }}>1&nbsp;&nbsp;Introduction</div>}
                  {lines(col).map((w, i) => (
                    <div key={i} style={{ height: 9 * ps, width: `${w * 100}%`, background: '#d9d5cc', borderRadius: 2 * ps, marginBottom: 15 * ps }} />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Nota adhesiva con cinta */}
          {props.note ? (
            <div
              style={{
                position: 'absolute',
                left: PW * 0.07,
                top: -PH * 0.04,
                transform: `rotate(${-5 + jitter(4, 0.6)}deg) scale(${noteP})`,
                transformOrigin: '30% 50%',
                opacity: clamp(noteP * 3),
                background: '#fffdf7',
                backgroundImage: SHEET_GRAIN,
                backgroundSize: `${256 * ps}px ${256 * ps}px`,
                padding: `${16 * ps}px ${30 * ps}px`,
                fontFamily: `"${props.font ?? 'Playfair Display Variable'}", ${SERIF}`,
                fontSize: 40 * ps,
                fontWeight: 700,
                color: '#151515',
                whiteSpace: 'nowrap',
                boxShadow: `0 ${10 * ps}px ${24 * ps}px rgba(40,30,20,.25)`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: -14 * ps,
                  width: 110 * ps,
                  height: 30 * ps,
                  transform: 'translateX(-50%) rotate(-4deg)',
                  background: accent,
                  opacity: 0.75,
                }}
              />
              {props.note}
            </div>
          ) : null}
        </div>

        {/* Recorte en estilo collage */}
        {imgAsset && (
          <div
            style={{
              position: 'absolute',
              left: px0 + PW * 0.56,
              top: py0 + PH * 0.6,
              width: iw,
              height: ih,
              transform: `translate(${jitter(5, 1.5 * u)}px, ${(1 - imgP) * H * 0.5}px) rotate(${4 + (1 - imgP) * 12 + jitter(6, 0.4)}deg)`,
              opacity: clamp(prog(tq, 0.35, 0.42) * 10),
              filter: `${outline('#ffffff', ob)} ${outline(accent, ob * 0.5)} drop-shadow(0 ${12 * ps}px ${18 * ps}px rgba(40,30,20,.3))`,
            }}
          >
            <div style={{ position: 'absolute', inset: 0, filter: props.bw !== false ? 'grayscale(1) contrast(1.15)' : undefined }}>
              <PanelMedia {...p} assetId={imgAsset.id} inPoint={0} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────── Título cromo líquido ───────────── */
function LiquidTitle({ props, t, W, H, u, vertical }: TplProps) {
  const s = (props.size ?? 1) * u;
  const text = String(props.text ?? '');
  const fs = 110 * s;
  const speed = props.speed ?? 1;
  if (props.mode === 'text') {
    const w = Math.min(W * 0.92, Math.max(fs, text.length * fs * 0.66));
    const h = fs * 1.3;
    return (
      <div className="tpl-root">
        <Anchor position={props.position ?? 'center'} W={W} H={H} vertical={vertical}>
          <LiquidChrome
            width={w}
            height={h}
            time={t * speed}
            tint={props.tint}
            text={text}
            font={`900 ${Math.round(fs * 0.5)}px "Inter Variable"`}
            quality={0.5}
            style={{ filter: `drop-shadow(0 ${4 * s}px ${6 * s}px rgba(0,0,0,.45))` }}
          />
        </Anchor>
      </div>
    );
  }
  const barH = fs * 1.35;
  const barW = Math.min(W * 0.9, Math.max(barH * 3.2, text.length * fs * 0.6 + 140 * s));
  return (
    <div className="tpl-root">
      <Anchor position={props.position ?? 'top-center'} W={W} H={H} vertical={vertical}>
        <div style={{ position: 'relative', width: barW, height: barH, filter: `drop-shadow(0 ${16 * s}px ${36 * s}px rgba(0,0,0,.4))` }}>
          <LiquidChrome width={barW} height={barH} time={t * speed} tint={props.tint} radius={14 * s} quality={0.5} style={{ position: 'absolute', inset: 0, width: barW, height: barH }} />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fbfbfc',
              fontSize: fs,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              textShadow: `0 ${2 * s}px ${4 * s}px rgba(0,0,0,.55), 0 0 ${22 * s}px rgba(0,0,0,.45)`,
            }}
          >
            {text}
          </div>
        </div>
      </Anchor>
    </div>
  );
}

/* ───────────── Título grande ───────────── */
function TitleCard({ props, t, dur, W, H, u, pout }: TplProps) {
  const words = parseAccent(props.text ?? '');
  const bgP = ease.outCubic(prog(t, 0, 0.4)) * (1 - ease.inCubic(pout));
  const bg = props.background ?? 'dim';
  const fs = (props.size ?? 120) * u;
  const isBebas = String(props.font).includes('Bebas');
  let wi = 0;
  const bgStyle: CSSProperties =
    bg === 'dim'
      ? { background: 'rgba(0,0,0,.5)' }
      : bg === 'blur'
        ? { backdropFilter: `blur(${26 * u}px)`, WebkitBackdropFilter: `blur(${26 * u}px)`, background: 'rgba(0,0,0,.2)' }
        : bg === 'black'
          ? { background: '#000' }
          : bg === 'white'
            ? { background: '#fff' }
            : {};
  const subP = ease.outCubic(prog(t, 0.25 + words.length * 0.04, 0.85 + words.length * 0.04));
  return (
    <div className="tpl-root">
      {bg !== 'none' && <div style={{ position: 'absolute', inset: 0, ...bgStyle, opacity: bgP }} />}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: props.align === 'left' ? 'flex-start' : 'center',
          padding: `0 ${W * 0.07}px`,
          textAlign: props.align === 'left' ? 'left' : 'center',
        }}
      >
        <div
          style={{
            fontFamily: `"${props.font ?? 'Inter Variable'}"`,
            fontSize: fs,
            fontWeight: isBebas ? 400 : 850,
            letterSpacing: isBebas ? '0.01em' : '-0.04em',
            lineHeight: isBebas ? 0.95 : 1.02,
            color: props.color ?? '#fff',
            maxWidth: W * 0.86,
          }}
        >
          {words.map((w, i) => {
            if (/^\s+$/.test(w.word)) return w.word.includes('\n') ? <br key={i} /> : ' ';
            const k = wi++;
            const p = ease.outCubic(prog(t, 0.06 + k * 0.07, 0.56 + k * 0.07));
            return (
              <span
                key={i}
                className="cap-word"
                style={{
                  color: w.accent ? props.accent : undefined,
                  transform: `translateY(${(1 - p) * 0.45 * fs}px)`,
                  opacity: p,
                  filter: p < 1 ? `blur(${(1 - p) * 12 * u}px)` : undefined,
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
        {props.subtitle ? (
          <div
            style={{
              marginTop: fs * 0.3,
              fontSize: fs * 0.32,
              fontWeight: 550,
              color: props.color ?? '#fff',
              opacity: subP * 0.85,
              transform: `translateY(${(1 - subP) * 20 * u}px)`,
              letterSpacing: '-0.01em',
            }}
          >
            {props.subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────── Texto ───────────── */
function TextTpl({ props, W, H, u, vertical }: TplProps) {
  const fs = (props.size ?? 80) * u;
  const box = props.box;
  return (
    <div className="tpl-root">
      <Anchor position={props.position ?? 'center'} W={W} H={H} vertical={vertical}>
        <div
          style={{
            fontFamily: `"${props.font ?? 'Inter Variable'}"`,
            fontSize: fs,
            fontWeight: props.weight ?? 800,
            color: props.color ?? '#fff',
            textAlign: props.align ?? 'center',
            textTransform: props.uppercase ? 'uppercase' : undefined,
            letterSpacing: '-0.02em',
            lineHeight: 1.08,
            whiteSpace: 'pre-wrap',
            maxWidth: W * 0.88,
            padding: box ? `${fs * 0.18}px ${fs * 0.32}px` : undefined,
            background: box ? props.boxColor : undefined,
            borderRadius: box ? fs * 0.16 : undefined,
            textShadow: props.shadow && !box ? `0 ${3 * u}px ${18 * u}px rgba(0,0,0,.55)` : undefined,
          }}
        >
          {props.text}
        </div>
      </Anchor>
    </div>
  );
}

/* ───────────── Etiqueta ───────────── */
function BadgeTpl({ props, W, H, u, vertical }: TplProps) {
  return (
    <div className="tpl-root">
      <Anchor position={props.position ?? 'bottom-right'} W={W} H={H} vertical={vertical}>
        <Badge text={props.text} dot={props.dot} dotColor={props.dotColor} u={u * (props.size ?? 1)} style={props.style} />
      </Anchor>
    </div>
  );
}

/* ───────────── Botón suscribirse ───────────── */
function Subscribe({ props, t, dur, W, H, u, vertical }: TplProps) {
  const s = (props.size ?? 1) * u;
  const clickAt = Math.min(dur * 0.45, 1.6);
  const cursorIn = ease.inOutCubic(prog(t, clickAt - 0.7, clickAt));
  const pressed = t >= clickAt && t < clickAt + 0.15;
  const done = t >= clickAt;
  const bell = done ? Math.sin((t - clickAt) * 40) * 18 * Math.max(0, 1 - (t - clickAt) * 1.8) : 0;
  const Icon = ICON_MAP[props.icon] ?? ICON_MAP.bell;
  const accent = props.accent ?? '#ff3b30';
  return (
    <div className="tpl-root">
      <Anchor position={props.position ?? 'bottom-center'} W={W} H={H} vertical={vertical}>
        <div style={{ position: 'relative' }}>
          <div
            className="glass-card"
            style={{
              ...cssVars({ '--blur': `${20 * s}px`, '--u': s }),
              display: 'flex',
              alignItems: 'center',
              gap: 18 * s,
              padding: `${22 * s}px ${40 * s}px`,
              borderRadius: 999,
              fontSize: 52 * s,
              fontWeight: 750,
              letterSpacing: '-0.02em',
              background: done ? accent : undefined,
              transform: `scale(${pressed ? 0.94 : 1})`,
              transition: 'none',
            }}
          >
            <div className="chrome-edge" style={cssVars({ '--edge': `${2.4 * s}px`, '--angle': `${t * 60}deg` })} />
            <Icon size={52 * s} strokeWidth={2.4} style={{ transform: `rotate(${bell}deg)` }} />
            <span>{done ? props.done : props.text}</span>
          </div>
          <MousePointer2
            size={64 * s}
            fill="#fff"
            color="#111"
            strokeWidth={1.5}
            style={{
              position: 'absolute',
              left: `${lerp(140, 62, cursorIn)}%`,
              top: `${lerp(170, 55, cursorIn)}%`,
              opacity: clamp(cursorIn * 3) * (t > clickAt + 0.8 ? clamp(1 - (t - clickAt - 0.8) * 3) : 1),
              transform: `scale(${pressed ? 0.85 : 1})`,
              filter: `drop-shadow(0 ${4 * s}px ${8 * s}px rgba(0,0,0,.4))`,
            }}
          />
        </div>
      </Anchor>
    </div>
  );
}

/* ───────────── Barra de progreso ───────────── */
function Progress({ props, t, dur, W, u }: TplProps) {
  const h = (props.height ?? 8) * u;
  return (
    <div className="tpl-root">
      <div
        style={{
          position: 'absolute',
          left: 0,
          [props.edge === 'bottom' ? 'bottom' : 'top']: 0,
          height: h,
          width: W * clamp(t / Math.max(0.01, dur)),
          background: props.color ?? '#d9f99d',
          borderRadius: `0 ${h}px ${h}px 0`,
          boxShadow: `0 0 ${12 * u}px ${props.color ?? '#d9f99d'}`,
        }}
      />
    </div>
  );
}

export const TEMPLATE_COMPONENTS: Record<string, ComponentType<TplProps>> = {
  'glass-lower-third': GlassLowerThird,
  'split-screen': SplitScreen,
  triptych: Triptych,
  paper: Paper,
  'liquid-title': LiquidTitle,
  'title-card': TitleCard,
  text: TextTpl,
  badge: BadgeTpl,
  subscribe: Subscribe,
  progress: Progress,
};
