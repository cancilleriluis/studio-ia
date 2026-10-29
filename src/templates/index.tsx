import type { CSSProperties, ComponentType } from 'react';
import { MousePointer2 } from 'lucide-react';
import { clamp, ease, lerp, prog } from '../engine/anim';
import { LiquidChrome } from '../engine/LiquidChrome';
import { Anchor, ICON_MAP, PanelMedia, parseAccent, type TplProps } from './common';
import { PAPERS_COMPONENTS } from './papers';
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
  ...PAPERS_COMPONENTS,
  'liquid-title': LiquidTitle,
  'title-card': TitleCard,
  text: TextTpl,
  badge: BadgeTpl,
  subscribe: Subscribe,
  progress: Progress,
};
