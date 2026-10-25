import type { CSSProperties } from 'react';
import type { Project } from '../../shared/types';
import { activeSegment } from '../../shared/captions';
import { clamp, ease, lerp, prog } from './anim';

export function Captions({ project, t, W, H, u }: { project: Project; t: number; W: number; H: number; u: number }) {
  const { style, enabled } = project.captions;
  if (!enabled) return null;
  const seg = activeSegment(project, t);
  if (!seg) return null;
  const fs = style.size * u;
  const local = t - seg.start;
  const enter = ease.outBack(prog(local, 0, 0.16));
  const words = seg.words.length ? seg.words : [{ start: seg.start, end: seg.end, text: seg.text }];
  const activeIdx = words.findIndex((w, i) => t >= w.start && (t < w.end || (words[i + 1] && t < words[i + 1].start)));
  const preset = style.preset;

  const base: CSSProperties = {
    fontFamily: `"${style.font}"`,
    fontSize: fs,
    lineHeight: 1.12,
    color: style.color,
    textAlign: 'center',
    maxWidth: W * 0.86,
    textTransform: style.uppercase ? 'uppercase' : undefined,
  };

  let box: CSSProperties = {};
  let wordStyle = (_i: number, _active: boolean, _spoken: boolean): CSSProperties => ({});

  if (preset === 'pop') {
    base.fontWeight = String(style.font).includes('Bebas') ? 400 : 900;
    base.letterSpacing = '-0.02em';
    base.WebkitTextStroke = `${fs * 0.12}px #000`;
    base.wordSpacing = '0.16em';
    base.paintOrder = 'stroke fill';
    base.textShadow = `0 ${fs * 0.06}px ${fs * 0.18}px rgba(0,0,0,.55)`;
    box = { transform: `scale(${lerp(0.82, 1, enter)})`, opacity: clamp(enter * 2) };
    wordStyle = (_i, active) =>
      active ? { color: style.highlight, transform: 'scale(1.08)', display: 'inline-block' } : {};
  } else if (preset === 'karaoke') {
    base.fontWeight = 800;
    base.letterSpacing = '-0.02em';
    base.textShadow = `0 ${fs * 0.05}px ${fs * 0.2}px rgba(0,0,0,.6)`;
    wordStyle = (_i, active, spoken) => ({ color: spoken || active ? style.highlight : style.color, opacity: spoken || active ? 1 : 0.7 });
  } else if (preset === 'glass') {
    base.fontWeight = 650;
    base.letterSpacing = '-0.015em';
    box = {
      padding: `${fs * 0.28}px ${fs * 0.55}px`,
      borderRadius: fs * 0.5,
      background: 'linear-gradient(135deg, rgba(255,255,255,.26), rgba(255,255,255,.1))',
      backdropFilter: `blur(${22 * u}px) saturate(150%)`,
      WebkitBackdropFilter: `blur(${22 * u}px) saturate(150%)`,
      boxShadow: `0 ${16 * u}px ${40 * u}px rgba(0,0,0,.3), inset 0 ${1.5 * u}px 0 rgba(255,255,255,.55)`,
      border: `${1.5 * u}px solid rgba(255,255,255,.35)`,
      transform: `translateY(${(1 - enter) * 16 * u}px)`,
      opacity: clamp(enter * 2),
    };
    wordStyle = (_i, active) => (active ? { color: style.highlight } : {});
  } else if (preset === 'clean') {
    base.fontWeight = 600;
    box = {
      padding: `${fs * 0.18}px ${fs * 0.4}px`,
      borderRadius: fs * 0.18,
      background: 'rgba(0,0,0,.62)',
    };
  } else {
    base.fontWeight = 600;
    base.fontSize = fs * 0.75;
    base.textShadow = `0 ${2 * u}px ${10 * u}px rgba(0,0,0,.8)`;
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: style.y * H,
        transform: 'translateY(-50%)',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div style={{ ...base, ...box }}>
        {words.map((w, i) => (
          <span key={i}>
            <span className="cap-word" style={wordStyle(i, i === activeIdx, t >= w.end)}>
              {w.text}
            </span>
            {i < words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
