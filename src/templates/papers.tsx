// Plantillas de la sección «Papers»: hojas, recortes, titulares y datos con estética de collage.
// Todo depende solo del tiempo; el «stop motion» cuantiza el tiempo a 12 fps.

import type { CSSProperties, ReactNode } from 'react';
import { clamp, ease, lerp, noise1, prog } from '../engine/anim';
import { PanelMedia, parseAccent, type TplProps } from './common';

/* ───────────── Texturas, marcas y piezas comunes ───────────── */
const svgBg = (svg: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
const noiseSvg = (size: number, freq: number, octaves: number, matrix: string) =>
  svgBg(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${octaves}' stitchTiles='stitch'/><feColorMatrix values='${matrix}'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
  );
/** Grano fino y manchas grandes de papel (negro con alfa sacado del ruido). */
const GRAIN = noiseSvg(256, 0.9, 2, '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.12 0 0 0 0');
const SHEET_GRAIN = noiseSvg(256, 0.9, 2, '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.05 0 0 0 0');
const CRUMPLE = noiseSvg(700, 0.012, 3, '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.16 0 0 0 -0.07');
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

/** Grano y manchas claras, para fondos oscuros y para la textura de las barras. */
const GRAIN_LIGHT = noiseSvg(256, 0.9, 2, '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0.1 0 0 0 0');
const CRUMPLE_LIGHT = noiseSvg(700, 0.012, 3, '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0.3 0 0 0 -0.1');
const GROTESK = '"Inter Variable", Inter, system-ui, sans-serif';

const DARK_BACKDROPS = new Set(['dark', 'dim']);

/** Fondo a pantalla completa con textura de papel. */
function Backdrop({ kind, u, opacity = 1 }: { kind: string; u: number; opacity?: number }) {
  if (kind === 'none') return null;
  if (kind === 'dim') return <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', opacity }} />;
  const g = `${256 * u}px ${256 * u}px`;
  const c = `${700 * u}px ${700 * u}px`;
  const warmVignette = 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(60,45,30,.16))';
  let style: CSSProperties;
  if (kind === 'dark') {
    style = {
      backgroundColor: '#151515',
      backgroundImage: `radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(0,0,0,.55)), ${GRAIN_LIGHT}, ${CRUMPLE_LIGHT}`,
      backgroundSize: `100% 100%, ${g}, ${c}`,
    };
  } else if (kind === 'grid') {
    const line = 'rgba(80,70,50,.12)';
    const step = `${96 * u}px ${96 * u}px`;
    style = {
      backgroundColor: '#f4f0e4',
      backgroundImage: `${warmVignette}, linear-gradient(${line} ${1.5 * u}px, transparent ${1.5 * u}px), linear-gradient(90deg, ${line} ${1.5 * u}px, transparent ${1.5 * u}px), ${PAPER_TEXTURE}`,
      backgroundSize: `100% 100%, ${step}, ${step}, ${g}, ${c}`,
    };
  } else if (kind === 'pink') {
    // Póster doblado: pliegues en cruz.
    const fold = 'transparent 49.7%, rgba(90,40,30,.07) 50%, rgba(255,255,255,.25) 50.3%, transparent 50.6%';
    style = {
      backgroundColor: '#f3ddd6',
      backgroundImage: `${warmVignette}, linear-gradient(90deg, ${fold}), linear-gradient(${fold}), ${PAPER_TEXTURE}`,
      backgroundSize: `100% 100%, 100% 100%, 100% 100%, ${g}, ${c}`,
    };
  } else {
    style = {
      backgroundColor: '#ebe7df',
      backgroundImage: `${warmVignette}, ${PAPER_TEXTURE}`,
      backgroundSize: `100% 100%, ${g}, ${c}`,
    };
  }
  return <div style={{ position: 'absolute', inset: 0, opacity, ...style }} />;
}

/** Reloj del collage: tiempo a 12 fps y un temblor que cambia 6 veces por segundo. */
function collageClock(t: number, stop: boolean) {
  const tq = stop ? Math.floor(t * 12) / 12 : t;
  const boil = stop ? Math.floor(t * 6) : 0;
  const jitter = (seed: number, amp: number) => (stop ? noise1(boil * 0.731 + seed, seed) * amp : 0);
  return { tq, jitter };
}

/** Factor para comprimir un guion de `needed` segundos en un clip de `dur`. */
const scriptSpeed = (needed: number, dur: number) => Math.max(1, needed / Math.max(1, dur - 0.5));

/** clip-path de papel rasgado (borde inferior y, opcionalmente, superior); `depth` en px. */
function tornClip(seed: number, depth: number, top = false, teeth = 28): string {
  const pts: string[] = [];
  for (let i = 0; i <= teeth; i++) {
    const x = (i / teeth) * 100;
    pts.push(top ? `${x}% ${hash(seed * 97 + i) * depth}px` : `${x}% 0px`);
  }
  for (let i = teeth; i >= 0; i--) {
    const x = (i / teeth) * 100;
    pts.push(`${x}% calc(100% - ${hash(seed * 131 + i + 500) * depth}px)`);
  }
  return `polygon(${pts.join(', ')})`;
}

/** Contorno sólido alrededor de la silueta (sirve con PNG recortados). */
const outline = (c: string, b: number) =>
  `drop-shadow(${b}px 0 0 ${c}) drop-shadow(-${b}px 0 0 ${c}) drop-shadow(0 ${b}px 0 ${c}) drop-shadow(0 -${b}px 0 ${c})`;

/** Recorte de collage: medio con borde blanco, contorno de color y, si se quiere, en blanco y negro. */
function CutOut({ p, assetId, w, h, bw, edge, ring, s, style }: {
  p: TplProps;
  assetId: string;
  w: number;
  h: number;
  bw: boolean;
  edge: number;
  ring?: string;
  s: number;
  style?: CSSProperties;
}) {
  const ringFilter = ring ? `${outline(ring, edge * 0.5)} ` : '';
  return (
    <div
      style={{
        position: 'absolute',
        width: w,
        height: h,
        filter: `${outline('#ffffff', edge)} ${ringFilter}drop-shadow(0 ${12 * s}px ${18 * s}px rgba(40,30,20,.3))`,
        ...style,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, filter: bw ? 'grayscale(1) contrast(1.15)' : undefined }}>
        <PanelMedia {...p} assetId={assetId} inPoint={0} />
      </div>
    </div>
  );
}

/** Alto de un recorte con la proporción de su medio (o `fallback` si no se conoce). */
function cutOutHeight(p: TplProps, assetId: string, w: number, fallback: number, maxRatio = 1.4) {
  const a = p.assets.find((x) => x.id === assetId);
  return a?.width && a?.height ? w * Math.min(maxRatio, a.height / a.width) : w * fallback;
}

/** Número de un texto como "4%", "$250 bn" o "-3,5": prefijo, valor, decimales y sufijo. */
function parseFigure(text: string) {
  const m = String(text ?? '').match(/^(\D*?)(-?\d+(?:[.,]\d+)?)(.*)$/s);
  if (!m) return null;
  const comma = m[2].includes(',');
  const num = m[2].replace(',', '.');
  return { prefix: m[1], value: parseFloat(num), decimals: num.split('.')[1]?.length ?? 0, comma, suffix: m[3] };
}

/** Cuenta desde 0 hasta la cifra del texto según `p` (0..1). */
function countUp(text: string, p: number): string {
  const f = parseFigure(text);
  if (!f) return text;
  const v = (f.value * p).toFixed(f.decimals);
  return f.prefix + (f.comma ? v.replace('.', ',') : v) + f.suffix;
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
  const sp = scriptSpeed(needed, dur); // comprime el guion si el clip es corto
  const tc = t * sp; // tiempo continuo (cámara)
  const clock = collageClock(t, stop);
  const tq = clock.tq * sp; // tiempo a 12 fps (elementos del collage)
  const { jitter } = clock;

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
  const ih = cutOutHeight(p, props.image, iw, 0.7);

  const bg = props.background ?? 'paper';
  const lines = (col: number) =>
    Array.from({ length: 40 }, (_, i) => {
      const r = hash(col * 100 + i);
      const end = i % 7 === 6;
      return end ? 0.3 + r * 0.45 : 0.9 + r * 0.1;
    });

  return (
    <div className="tpl-root">
      <Backdrop kind={bg} u={u} opacity={bg === 'dim' ? bgIn : 1} />

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
          <CutOut
            p={p}
            assetId={imgAsset.id}
            w={iw}
            h={ih}
            bw={props.bw !== false}
            edge={7 * ps}
            ring={accent}
            s={ps}
            style={{
              left: px0 + PW * 0.56,
              top: py0 + PH * 0.6,
              transform: `translate(${jitter(5, 1.5 * u)}px, ${(1 - imgP) * H * 0.5}px) rotate(${4 + (1 - imgP) * 12 + jitter(6, 0.4)}deg)`,
              opacity: clamp(prog(tq, 0.35, 0.42) * 10),
            }}
          />
        )}
      </div>
    </div>
  );
}


/* ───────────── Gráfico de barras (collage) ───────────── */
interface Datum {
  label: string;
  value: number;
  text: string;
}

/** Líneas "Etiqueta: valor" (o solo "valor"); admite "%" y miles con coma. */
function parseData(text: string): Datum[] {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((l) => {
      const m = l.match(/^(.*?)[:=]\s*(-?[\d.,]+\s*%?)\s*$/);
      const text = (m ? m[2] : l).trim();
      const raw = text.replace('%', '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
      return { label: m ? m[1].trim() : '', value: Math.max(0, parseFloat(raw) || 0), text };
    });
}

/** Línea discontinua algo temblorosa (de x0,y0 a x1,y1), como trazada a mano. */
function DashedLine({ x0, y0, x1, y1, color, u, reveal, vertical }: {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  u: number;
  reveal: number;
  vertical: boolean;
}) {
  const pts = Array.from({ length: 21 }, (_, i) => {
    const k = i / 20;
    const wob = (hash(i + 900) - 0.5) * 3 * u;
    return `${lerp(x0, x1, k) + (vertical ? wob : 0)},${lerp(y0, y1, k) + (vertical ? 0 : wob)}`;
  }).join(' ');
  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        clipPath: vertical ? `inset(0 0 ${(1 - reveal) * 100}% 0)` : `inset(0 ${(1 - reveal) * 100}% 0 0)`,
      }}
    >
      <polyline points={pts} fill="none" stroke={color} strokeWidth={5 * u} strokeDasharray={`${16 * u} ${11 * u}`} />
    </svg>
  );
}

function StatBars(p: TplProps) {
  const { props, t, dur, W, H, u, vertical } = p;
  const color = props.color ?? '#ff3b1f';
  const bg = props.background ?? 'grid';
  const ink = DARK_BACKDROPS.has(bg) ? '#f4f1ea' : '#161616';
  const data = parseData(props.data);
  const n = Math.max(1, data.length);
  const horizontal = props.orientation === 'horizontal';
  const ref = Math.max(0, Number(props.refLine) || 0);
  const max = Math.max(ref, ...data.map((d) => d.value), 0.0001);
  const highlight = String(props.highlight ?? '').trim();
  const hasTitle = !!String(props.title ?? '').trim();

  // Guion: título → barras una a una → línea de referencia → cifra destacada.
  const barStart = hasTitle ? 0.45 : 0.15;
  const barStep = Math.min(0.12, 0.9 / n);
  const barsEnd = barStart + (n - 1) * barStep + 0.55;
  const lineStart = barsEnd - 0.2;
  const hiStart = ref ? lineStart + 0.5 : barsEnd;
  const sp = scriptSpeed(hiStart + (highlight ? 0.9 : 0.2), dur);
  const clock = collageClock(t, props.stopMotion !== false);
  const tq = clock.tq * sp;
  const { jitter } = clock;

  const mx = W * 0.06;
  const top = H * (vertical ? 0.12 : 0.09);
  const titleFs = (vertical ? 70 : 62) * u;
  const chartTop = hasTitle ? top + titleFs * (vertical ? 3.6 : 2.6) : top + 40 * u;
  const chartBottom = H * (vertical ? 0.78 : 0.86);
  const labelFs = (vertical ? 30 : 26) * u;
  const hiFs = (vertical ? 150 : 130) * u;
  const grow = (i: number) => Math.max(0, ease.outBack(prog(tq, barStart + i * barStep, barStart + i * barStep + 0.55)));
  const barLook = (i: number): CSSProperties => ({
    position: 'absolute',
    backgroundColor: color,
    backgroundImage: `linear-gradient(${horizontal ? '90deg' : '180deg'}, rgba(255,255,255,.4), rgba(255,255,255,0) 45%), ${CRUMPLE_LIGHT}, ${GRAIN_LIGHT}`,
    backgroundSize: `100% 100%, ${700 * u}px ${700 * u}px, ${256 * u}px ${256 * u}px`,
    backgroundPosition: `0 0, ${-i * 137 * u}px ${-i * 61 * u}px, 0 0`,
  });
  const valueLabel = (d: Datum, g: number): ReactNode =>
    props.showValues !== false ? (
      <span style={{ opacity: clamp((g - 0.6) * 3), fontWeight: 800 }}>{countUp(d.text, clamp(g))}</span>
    ) : null;

  const bars: ReactNode[] = [];
  let refLine: ReactNode = null;
  // Rincón de la cifra destacada: sobre las barras más bajas.
  const lowEnd = data.length > 1 && data[data.length - 1].value <= data[0].value ? 'right' : 'left';
  let hiPos: CSSProperties = {};

  if (!horizontal) {
    const hasLabels = data.some((d) => d.label);
    const base = chartBottom - (hasLabels ? labelFs * 1.8 : 0);
    const gapR = 0.38;
    const bw = (W - mx * 2) / (n + (n - 1) * gapR);
    const yOf = (v: number) => base - ((base - chartTop) * v) / max;
    data.forEach((d, i) => {
      const g = grow(i);
      const h = (base - yOf(d.value)) * g;
      const left = mx + i * bw * (1 + gapR);
      bars.push(
        <div key={i}>
          <div
            style={{
              ...barLook(i),
              left,
              width: bw,
              top: base - h,
              height: h,
              transform: `rotate(${jitter(10 + i, 0.3)}deg)`,
              transformOrigin: '50% 100%',
            }}
          />
          <div style={{ position: 'absolute', left: left - bw, width: bw * 3, top: base - h - labelFs * 1.5, textAlign: 'center', fontSize: labelFs, color: ink }}>
            {valueLabel(d, g)}
          </div>
          {d.label ? (
            <div
              style={{ position: 'absolute', left: left - bw, width: bw * 3, top: base + labelFs * 0.45, textAlign: 'center', fontSize: labelFs, fontWeight: 600, color: ink, opacity: 0.75 * clamp(g * 3) }}
            >
              {d.label}
            </div>
          ) : null}
        </div>,
      );
    });
    if (ref) {
      const y = yOf(ref);
      refLine = <DashedLine x0={mx * 0.5} y0={y} x1={W - mx * 0.5} y1={y} color={ink} u={u} reveal={ease.inOutCubic(prog(tq, lineStart, lineStart + 0.6))} vertical={false} />;
    }
    hiPos = { [lowEnd]: mx, top: chartTop + (base - chartTop) * 0.12 };
  } else {
    const rowH = Math.min((vertical ? 230 : 150) * u, (chartBottom - chartTop) / n);
    // Con pocas filas, el bloque baja un poco para no dejar vacía la parte de abajo.
    const rowsTop = chartTop + (chartBottom - chartTop - n * rowH) * 0.35;
    const lab = Math.min(labelFs * 1.1, rowH * 0.3);
    const barH = rowH * 0.4;
    const span = W - mx * 2 - (highlight ? W * 0.3 : W * 0.12);
    data.forEach((d, i) => {
      const g = grow(i);
      const rowTop = rowsTop + i * rowH;
      const w = (span * d.value * g) / max;
      bars.push(
        <div key={i}>
          <div style={{ position: 'absolute', left: mx, top: rowTop, fontSize: lab, fontWeight: 700, color: ink, opacity: clamp(g * 3), whiteSpace: 'nowrap' }}>{d.label}</div>
          <div
            style={{
              ...barLook(i),
              left: mx,
              top: rowTop + lab * 1.4,
              width: w,
              height: barH,
              transform: `rotate(${jitter(10 + i, 0.15)}deg)`,
              transformOrigin: '0 50%',
            }}
          />
          <div style={{ position: 'absolute', left: mx + w + 16 * u, top: rowTop + lab * 1.4, height: barH, display: 'flex', alignItems: 'center', fontSize: lab, color: ink }}>
            {valueLabel(d, g)}
          </div>
        </div>,
      );
    });
    if (ref) {
      const x = mx + (span * ref) / max;
      refLine = <DashedLine x0={x} y0={rowsTop - 20 * u} x1={x} y1={rowsTop + n * rowH} color={ink} u={u} reveal={ease.inOutCubic(prog(tq, lineStart, lineStart + 0.6))} vertical />;
    }
    let lowest = 0;
    data.forEach((d, i) => d.value < data[lowest].value && (lowest = i));
    hiPos = { right: mx, top: rowsTop + lowest * rowH - hiFs * 0.2 };
  }

  const hiP = ease.outBack(prog(tq, hiStart, hiStart + 0.4));
  const hiCount = ease.outCubic(prog(tq, hiStart, hiStart + 0.7));
  const imgAsset = p.assets.find((a) => a.id === props.image);
  const iw = W * (vertical ? 1 : 0.92);
  const ih = Math.min(H * 0.55, cutOutHeight(p, props.image, iw, 0.45));
  const imgP = ease.outBack(prog(tq, 0.15, 0.6));
  let wi = 0;

  return (
    <div className="tpl-root" style={{ fontFamily: GROTESK }}>
      <Backdrop kind={bg} u={u} />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + 0.04 * clamp(t / Math.max(0.01, dur))})` }}>
        {hasTitle && (
          <div style={{ position: 'absolute', left: mx, top, maxWidth: W - mx * 2, color: ink }}>
            <div style={{ fontFamily: SERIF, fontSize: titleFs, fontWeight: 700, lineHeight: 1.08, letterSpacing: '-0.015em' }}>
              {parseAccent(props.title).map((w, i) => {
                if (/^\s+$/.test(w.word)) return ' ';
                const k = wi++;
                const q = ease.outCubic(prog(tq, 0.05 + k * 0.05, 0.35 + k * 0.05));
                return (
                  <span key={i} className="cap-word" style={{ fontStyle: w.accent ? 'italic' : undefined, opacity: q > 0 ? 1 : 0, transform: `translateY(${(1 - q) * 0.3 * titleFs}px)` }}>
                    {w.word}
                  </span>
                );
              })}
            </div>
            {props.subtitle ? (
              <div style={{ marginTop: titleFs * 0.3, fontSize: titleFs * 0.36, fontWeight: 500, opacity: 0.7 * ease.outCubic(prog(tq, 0.3, 0.6)) }}>{props.subtitle}</div>
            ) : null}
          </div>
        )}
        {bars}
        {refLine}
        {imgAsset && (
          <CutOut
            p={p}
            assetId={imgAsset.id}
            w={iw}
            h={ih}
            bw={props.bw !== false}
            edge={0}
            s={u}
            style={{
              left: (W - iw) / 2,
              top: H - ih * 0.96,
              transform: `translate(${jitter(30, 1.5 * u)}px, ${(1 - imgP) * H * 0.4}px)`,
              opacity: clamp(prog(tq, 0.15, 0.22) * 10),
            }}
          />
        )}
        {highlight ? (
          <div
            style={{
              position: 'absolute',
              ...hiPos,
              background: ink,
              color: DARK_BACKDROPS.has(bg) ? '#161616' : '#f4f1ea',
              fontSize: hiFs,
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1,
              padding: `${hiFs * 0.1}px ${hiFs * 0.22}px`,
              transform: `rotate(${-1.5 + jitter(40, 0.6)}deg) scale(${hiP})`,
              opacity: clamp(hiP * 3),
              whiteSpace: 'nowrap',
            }}
          >
            {countUp(highlight, hiCount)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────── Titulares recortados ───────────── */
const OUTLET_STYLES: CSSProperties[] = [
  { fontFamily: GROTESK, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b6b6b', textAlign: 'center' },
  { fontFamily: `"Playfair Display Variable", ${SERIF}`, fontWeight: 900, color: '#111', textAlign: 'center' },
  { fontFamily: GROTESK, fontWeight: 700, color: '#3a3a3a' },
];

function Headlines(p: TplProps) {
  const { props, t, dur, W, H, u, vertical } = p;
  const accent = props.accent ?? '#fff23a';
  const bg = props.background ?? 'dark';
  const items: any[] = (props.clippings ?? []).filter((c: any) => String(c?.headline ?? '').trim()).slice(0, 3);
  const runs = items.map((c) => markRuns(c.headline));

  // Guion: los recortes caen uno tras otro y luego se resaltan en orden.
  let marksAt = 0;
  const sched = runs.map((r, i) => {
    const land = 0.15 + i * 0.45;
    const ms = markSchedule(r, Math.max(land + 0.4, marksAt));
    marksAt = ms.end + 0.05;
    return { land, starts: ms.starts };
  });
  const sp = scriptSpeed(marksAt + 0.5, dur);
  const clock = collageClock(t, props.stopMotion !== false);
  const tq = clock.tq * sp;
  const { jitter } = clock;

  const slots =
    items.length === 1
      ? [{ x: vertical ? 0.08 : 0.22, y: vertical ? 0.38 : 0.32, w: vertical ? 0.84 : 0.56, r: -1 }]
      : vertical
        ? [
            { x: 0.06, y: 0.17, w: 0.8, r: -1.2 },
            { x: 0.13, y: 0.41, w: 0.81, r: 1.4 },
            { x: 0.05, y: 0.63, w: 0.84, r: -0.6 },
          ]
        : [
            { x: 0.07, y: 0.1, w: 0.47, r: -1 },
            { x: 0.46, y: 0.36, w: 0.5, r: 1.2 },
            { x: 0.07, y: 0.62, w: 0.5, r: -0.5 },
          ];
  const fs = (vertical ? 64 : 44) * u;

  return (
    <div className="tpl-root">
      <Backdrop kind={bg} u={u} />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + 0.05 * clamp(t / Math.max(0.01, dur))})` }}>
        {items.map((c, i) => {
          const slot = slots[i];
          const d = Math.max(0, ease.outBack(prog(tq, sched[i].land, sched[i].land + 0.45)));
          const style = OUTLET_STYLES[i % OUTLET_STYLES.length];
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: slot.x * W,
                top: slot.y * H,
                width: slot.w * W,
                opacity: tq >= sched[i].land ? 1 : 0,
                transform: `translateY(${(1 - d) * -70 * u}px) scale(${lerp(1.12, 1, d)}) rotate(${slot.r + (1 - d) * -4 + jitter(50 + i, 0.3)}deg)`,
                filter: `drop-shadow(0 ${14 * u}px ${24 * u}px rgba(0,0,0,.45))`,
              }}
            >
              <div
                style={{
                  background: '#fbfbf8',
                  backgroundImage: SHEET_GRAIN,
                  backgroundSize: `${256 * u}px ${256 * u}px`,
                  padding: `${(i === 1 ? 40 : 30) * u}px ${40 * u}px ${48 * u}px`,
                  clipPath: tornClip(i + 1, 16 * u, i === 1),
                  color: '#111',
                }}
              >
                {c.outlet ? <div style={{ ...style, fontSize: fs * 0.72, marginBottom: fs * 0.3, lineHeight: 1.1 }}>{c.outlet}</div> : null}
                <div style={{ fontFamily: SERIF, fontSize: fs, lineHeight: 1.22, textAlign: style.textAlign === 'center' ? 'center' : 'left' }}>
                  <MarkedText runs={runs[i]} starts={sched[i].starts} t={tq} mark="marker" accent={accent} fs={fs} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── Título collage ───────────── */
/** Trazo de brocha seca (forma de 1000×200 que se estira al tamaño de la palabra). */
const BRUSH_PATH = (() => {
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const x = 20 + (i / 24) * 960;
    top.push(`${x} ${12 + hash(i + 700) * 22}`);
    bottom.unshift(`${x} ${188 - hash(i + 800) * 22}`);
  }
  return `M 0 ${40 + hash(1) * 20} L ${top.join(' L ')} L 1000 ${60 + hash(2) * 30} L 985 ${120 + hash(3) * 20} L 1000 ${150 + hash(4) * 20} L ${bottom.join(' L ')} L 6 ${150 + hash(5) * 20} L 18 ${100 + hash(6) * 20} Z`;
})();

function CollageTitle(p: TplProps) {
  const { props, t, dur, W, H, u, vertical } = p;
  const accent = props.accent ?? '#ff2d7a';
  const brush = (props.style ?? 'brush') === 'brush';
  const bg = props.background ?? 'paper';
  const ink = DARK_BACKDROPS.has(bg) ? '#f4f1ea' : '#151515';
  const letters = [...String(props.word ?? '')];
  const fs = Math.min((vertical ? 340 : 320) * u, (W * 0.84) / Math.max(1, letters.length * 0.58));

  // Guion: brocha → letras una a una → etiqueta; el garabato se dibuja de fondo.
  const lettersStart = brush ? 0.35 : 0.15;
  const lettersEnd = lettersStart + letters.length * 0.05 + 0.3;
  const sp = scriptSpeed(Math.max(lettersEnd + 0.6, 1.8), dur);
  const clock = collageClock(t, props.stopMotion !== false);
  const tq = clock.tq * sp;
  const { jitter } = clock;
  const brushP = ease.inOutCubic(prog(tq, 0.12, 0.5));
  const tagP = ease.outBack(prog(tq, lettersEnd, lettersEnd + 0.35));
  const squiggleP = ease.inOutSine(prog(tq, 0.2, 1.7));
  const leadP = ease.outCubic(prog(tq, 0.05, 0.35));
  const font = `"${props.font ?? 'Playfair Display Variable'}", ${SERIF}`;

  const imgAsset = p.assets.find((a) => a.id === props.image);
  const iw = W * (vertical ? 0.62 : 0.34);
  const ih = cutOutHeight(p, props.image, iw, 0.6, 1.2);
  const imgP = ease.outBack(prog(tq, 0.1, 0.5));

  return (
    <div className="tpl-root">
      <Backdrop kind={bg} u={u} />
      {props.squiggle !== false && (
        // Caja de 5:3 centrada en el título, para que el trazo no se deforme en vertical.
        <svg
          viewBox="0 0 1000 600"
          style={{ position: 'absolute', left: 0, width: W, top: H * (vertical ? 0.44 : 0.47) - W * 0.3, height: W * 0.6, overflow: 'visible' }}
        >
          <path
            d="M 30 430 C 170 390, 250 520, 370 470 S 560 260, 520 200 S 420 160, 470 250 S 700 430, 760 300 S 820 70, 900 130 S 990 360, 960 580"
            fill="none"
            stroke={accent}
            strokeWidth={7 * u}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - squiggleP}
            opacity={squiggleP > 0 ? 1 : 0}
          />
        </svg>
      )}
      {imgAsset && (
        <CutOut
          p={p}
          assetId={imgAsset.id}
          w={iw}
          h={ih}
          bw={!!props.bw}
          edge={5 * u}
          s={u}
          style={{
            left: W * 0.06,
            top: H * (vertical ? 0.64 : 0.56),
            transform: `translate(${jitter(60, 1.5 * u)}px, ${(1 - imgP) * H * 0.4}px) rotate(${-2 + jitter(61, 0.4)}deg)`,
            opacity: clamp(prog(tq, 0.1, 0.17) * 10),
          }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: H * (vertical ? 0.12 : 0.06) }}>
        <div style={{ position: 'relative', transform: `rotate(${jitter(62, 0.3)}deg)` }}>
          {props.lead ? (
            <div
              style={{
                fontFamily: font,
                fontSize: fs * 0.17,
                fontWeight: 600,
                color: ink,
                marginBottom: fs * 0.06,
                marginLeft: fs * 0.08,
                opacity: leadP,
                transform: `translateY(${(1 - leadP) * 10 * u}px)`,
              }}
            >
              {props.lead}
            </div>
          ) : null}
          <div style={{ position: 'relative', display: 'inline-block', padding: brush ? `${fs * 0.06}px ${fs * 0.18}px` : 0 }}>
            {brush && (
              <svg
                viewBox="0 0 1000 200"
                preserveAspectRatio="none"
                style={{ position: 'absolute', left: 0, top: '6%', width: '100%', height: '92%', overflow: 'visible', clipPath: `inset(0 ${(1 - brushP) * 100}% 0 0)`, transform: 'rotate(-1.5deg)' }}
              >
                <path d={BRUSH_PATH} fill={accent} />
                {[46, 92, 150].map((y, i) => (
                  <path key={i} d={`M ${60 + i * 90} ${y} L ${940 - i * 70} ${y + 4}`} stroke="#fff" strokeOpacity={0.16} strokeWidth={4 + i * 2} />
                ))}
              </svg>
            )}
            <div style={{ position: 'relative', fontFamily: font, fontSize: fs, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.035em', color: brush ? '#fff' : ink, whiteSpace: 'nowrap' }}>
              {letters.map((ch, k) => {
                const q = Math.max(0, ease.outBack(prog(tq, lettersStart + k * 0.05, lettersStart + k * 0.05 + 0.3)));
                return (
                  <span
                    key={k}
                    className="cap-word"
                    style={{ opacity: q > 0 ? 1 : 0, transform: `translateY(${(1 - q) * 0.25 * fs}px) scale(${lerp(0.5, 1, q)}) rotate(${jitter(70 + k, 2.5)}deg)` }}
                  >
                    {ch}
                  </span>
                );
              })}
            </div>
            {props.tag ? (
              <div
                style={{
                  position: 'absolute',
                  left: brush ? fs * 0.05 : -fs * 0.1,
                  bottom: -fs * 0.22,
                  transform: `rotate(-6deg) scale(${tagP})`,
                  transformOrigin: '20% 100%',
                  opacity: clamp(tagP * 3),
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    background: brush ? '#151515' : accent,
                    color: '#fff',
                    fontFamily: GROTESK,
                    fontStyle: 'italic',
                    fontWeight: 700,
                    fontSize: fs * 0.14,
                    padding: `${fs * 0.03}px ${fs * 0.09}px`,
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {props.tag}
                  <div style={{ position: 'absolute', left: fs * 0.08, bottom: -fs * 0.04, width: fs * 0.08, height: fs * 0.08, background: 'inherit', transform: 'rotate(45deg)' }} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Captura (noticia o post) ───────────── */
const FOCUS_Y: Record<string, number> = { top: 0.22, center: 0.5, bottom: 0.78 };

function Screenshot(p: TplProps) {
  const { props, t, dur, W, H, u, vertical } = p;
  const asset = p.assets.find((a) => a.id === props.media);
  const look = props.style ?? 'card';
  const bg = props.background ?? 'blur';
  const accent = props.accent ?? '#f5a524';
  const clock = collageClock(t, !!props.stopMotion);
  const { tq, jitter } = clock;

  // La captura cabe en la zona segura manteniendo su proporción.
  const ratio = asset?.width && asset?.height ? asset.height / asset.width : 0.75;
  const maxW = W * (vertical ? 0.88 : 0.72);
  const maxH = H * (vertical ? 0.66 : 0.7);
  const cw = Math.min(maxW, maxH / ratio);
  const ch = cw * ratio;
  const pad = look === 'torn' ? 16 * u : 0;

  // Entrada con rebote y, después, acercamiento lento hacia la zona elegida.
  const enter = Math.max(0, ease.outBack(prog(tq, 0, 0.6)));
  const push = ease.inOutSine(prog(t, 0.5, Math.max(0.6, dur)));
  const zoom = lerp(1, props.zoom ?? 1.15, push);
  const fy = FOCUS_Y[props.focus ?? 'top'] ?? 0.5;
  const tilt = props.tilt ?? -1.5;
  const cardTop = (H - ch) / 2 - (vertical ? H * 0.02 : 0);
  // Punto de la pantalla hacia el que acerca la cámara: la altura elegida de la captura.
  const originY = cardTop + ch * fy;

  const media = asset ? <PanelMedia {...p} assetId={asset.id} inPoint={0} /> : <div className="tpl-placeholder" style={{ fontSize: 40 * u }}>Elige una captura</div>;

  return (
    <div className="tpl-root">
      {bg === 'blur' ? (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#111' }}>
          {asset && (
            <div style={{ position: 'absolute', inset: -60 * u, filter: `blur(${42 * u}px) brightness(.55) saturate(1.2)`, transform: `scale(${1.1 + 0.05 * push})` }}>
              <PanelMedia {...p} assetId={asset.id} inPoint={0} />
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: GRAIN_LIGHT, backgroundSize: `${256 * u}px ${256 * u}px`, opacity: 0.5 }} />
        </div>
      ) : (
        <Backdrop kind={bg} u={u} />
      )}

      <div style={{ position: 'absolute', inset: 0, transformOrigin: `50% ${originY}px`, transform: `scale(${zoom})` }}>
        <div
          style={{
            position: 'absolute',
            left: (W - cw) / 2 - pad,
            top: cardTop - pad,
            width: cw + pad * 2,
            height: ch + pad * 2,
            opacity: clamp(prog(tq, 0, 0.08) * 10),
            transform: `translateY(${(1 - enter) * 90 * u}px) scale(${lerp(0.88, 1, enter)}) rotate(${tilt + (1 - enter) * -5 + jitter(80, 0.3)}deg)`,
            filter: `drop-shadow(0 ${26 * u}px ${44 * u}px rgba(0,0,0,.45))`,
          }}
        >
          {look === 'torn' ? (
            <>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: '#fbfbf8',
                  backgroundImage: SHEET_GRAIN,
                  backgroundSize: `${256 * u}px ${256 * u}px`,
                  clipPath: tornClip(7, 14 * u, true),
                }}
              >
                <div style={{ position: 'absolute', inset: pad, overflow: 'hidden' }}>{media}</div>
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: -16 * u,
                  width: Math.min(220 * u, cw * 0.35),
                  height: 46 * u,
                  transform: 'translateX(-50%) rotate(-3deg)',
                  background: accent,
                  opacity: 0.8,
                }}
              />
            </>
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                overflow: 'hidden',
                borderRadius: look === 'card' ? 26 * u : 0,
                border: look === 'card' ? `${2 * u}px solid rgba(255,255,255,.22)` : undefined,
                background: '#fff',
              }}
            >
              {media}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const PAPERS_COMPONENTS = {
  paper: Paper,
  'stat-bars': StatBars,
  headlines: Headlines,
  'collage-title': CollageTitle,
  screenshot: Screenshot,
};
