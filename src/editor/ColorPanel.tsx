// Panel de color tipo Lumetri: looks, básico, creativo (LUT), ruedas de color y scopes.

import { useEffect, useRef, useState } from 'react';
import { Palette, RotateCcw, Upload } from 'lucide-react';
import type { Grade, MediaClip, Project, Wheel } from '../../shared/types';
import { GRADE_LOOKS, defaultGrade } from '../../shared/grade';
import { api } from '../api';
import { useEditor } from '../store';
import { NumberInput, type Binder } from './controls';

const editGrade = (b: Binder, id: string, fn: (g: Grade, c: MediaClip) => void) =>
  b.change((p) => {
    const c = p.clips.find((x) => x.id === id) as MediaClip | undefined;
    if (!c) return;
    c.grade = { ...defaultGrade(), ...(c.grade ?? {}) };
    fn(c.grade, c);
    delete c.color; // los ajustes CSS antiguos se sustituyen por la corrección completa
  });

/* ───────── Rueda de color ───────── */

function ColorWheel({ label, value, onChange, b }: { label: string; value: Wheel; onChange: (w: Wheel) => void; b: Binder }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = 78;
  const R = size / 2 - 6;
  const [hue, amt] = value ?? [0, 0];
  const a = (hue * Math.PI) / 180;
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + size / 2);
    const dy = e.clientY - (r.top + size / 2);
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    onChange([Math.round(h), Math.min(1, Math.hypot(dx, dy) / R)]);
  };
  return (
    <div className="wheel-wrap">
      <div
        ref={ref}
        className="wheel"
        style={{ width: size, height: size }}
        title="Arrastra para teñir · doble clic para restablecer"
        onPointerDown={(e) => {
          b.begin();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          set(e);
        }}
        onPointerMove={(e) => e.buttons && set(e)}
        onPointerUp={() => b.end()}
        onDoubleClick={() => onChange([0, 0])}
      >
        <div className="wheel-dot" style={{ left: size / 2 + Math.cos(a) * amt * R - 5, top: size / 2 + Math.sin(a) * amt * R - 5 }} />
      </div>
      <span>{label}</span>
    </div>
  );
}

/* ───────── Scopes ───────── */

function Scopes({ clipId }: { clipId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'wave' | 'vector'>('wave');
  useEffect(() => {
    const sw = 160;
    const sh = 90;
    const work = document.createElement('canvas');
    work.width = sw;
    work.height = sh;
    const wctx = work.getContext('2d', { willReadFrequently: true })!;
    const tick = () => {
      const out = ref.current;
      if (!out) return;
      const src =
        (document.querySelector(`.stage-frame canvas[data-graded="${clipId}"]`) as HTMLCanvasElement | null) ??
        (document.querySelector(`.stage-frame [data-clip-id="${clipId}"] video, .stage-frame [data-clip-id="${clipId}"] img`) as
          | HTMLVideoElement
          | HTMLImageElement
          | null);
      const W = out.width;
      const H = out.height;
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = '#08090b';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.lineWidth = 1;
      if (mode === 'wave') {
        for (const v of [0, 0.25, 0.5, 0.75, 1]) {
          const y = (1 - v) * (H - 8) + 4;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, H / 2 - 4, 0, Math.PI * 2);
        ctx.stroke();
        // Línea de tonos de piel
        const sa = (-123 * Math.PI) / 180;
        ctx.strokeStyle = 'rgba(255,180,120,.35)';
        ctx.beginPath();
        ctx.moveTo(W / 2, H / 2);
        ctx.lineTo(W / 2 + Math.cos(sa) * (H / 2 - 4), H / 2 + Math.sin(sa) * (H / 2 - 4));
        ctx.stroke();
      }
      if (!src) return;
      try {
        wctx.drawImage(src, 0, 0, sw, sh);
      } catch {
        return;
      }
      const px = wctx.getImageData(0, 0, sw, sh).data;
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      const plot = (x: number, y: number, r: number, g: number, b: number) => {
        const xi = Math.round(x);
        const yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
        const o = (yi * W + xi) * 4;
        d[o] = Math.min(255, d[o] + r);
        d[o + 1] = Math.min(255, d[o + 1] + g);
        d[o + 2] = Math.min(255, d[o + 2] + b);
      };
      for (let y = 0; y < sh; y++)
        for (let x = 0; x < sw; x++) {
          const o = (y * sw + x) * 4;
          const r = px[o] / 255;
          const g = px[o + 1] / 255;
          const b = px[o + 2] / 255;
          if (mode === 'wave') {
            const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            plot((x / sw) * W, (1 - l) * (H - 8) + 4, 26, 60, 30);
          } else {
            const u = -0.169 * r - 0.331 * g + 0.5 * b;
            const v = 0.5 * r - 0.419 * g - 0.081 * b;
            const s = (H / 2 - 4) * 1.8;
            plot(W / 2 + u * s, H / 2 - v * s, 40 * r + 12, 40 * g + 12, 40 * b + 12);
          }
        }
      ctx.putImageData(img, 0, 0);
    };
    const id = setInterval(tick, 220);
    tick();
    return () => clearInterval(id);
  }, [clipId, mode]);
  return (
    <div className="scopes">
      <div className="seg" style={{ marginBottom: 6 }}>
        <button className={mode === 'wave' ? 'on' : ''} onClick={() => setMode('wave')}>
          Forma de onda
        </button>
        <button className={mode === 'vector' ? 'on' : ''} onClick={() => setMode('vector')}>
          Vectorscopio
        </button>
      </div>
      <canvas ref={ref} width={292} height={120} />
      <div className="hint">
        {mode === 'wave' ? 'Luminancia de izquierda a derecha: evita pegarte a 0 % (negros) o 100 % (blancos quemados).' : 'Saturación y tono. Los tonos de piel caen sobre la línea naranja.'}
      </div>
    </div>
  );
}

/* ───────── Sección completa ───────── */

export function LumetriSection({ clip, project, b }: { clip: MediaClip; project: Project; b: Binder }) {
  const g = { ...defaultGrade(), ...(clip.grade ?? {}) };
  const st = useEditor.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const luts = project.assets.filter((a) => a.type === 'lut' && !a.removed);
  const slider = (label: string, k: keyof Grade, min: number, max: number, step = 0.01) => (
    <div className="field" key={k}>
      <label>{label}</label>
      <NumberInput
        value={g[k] as number}
        min={min}
        max={max}
        step={step}
        onBegin={b.begin}
        onEnd={b.end}
        onChange={(v) => editGrade(b, clip.id, (gr) => ((gr as any)[k] = v))}
      />
    </div>
  );

  const importLut = async (files: File[]) => {
    if (!files.length) return;
    try {
      const assets = await api.upload(project.id, files);
      assets.forEach((a) => st.upsertAsset(a));
      const lut = assets.find((a) => a.type === 'lut');
      if (lut) editGrade(b, clip.id, (gr) => (gr.lut = lut.id));
    } catch (e: any) {
      st.notify(String(e.message), 'error');
    }
  };

  return (
    <div className="section">
      <div className="section-title">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Palette size={12} /> Color (Lumetri)
        </span>
        <button
          className="icon-btn sm"
          title="Restablecer todo el color"
          onClick={() =>
            b.change((p) => {
              const c = p.clips.find((x) => x.id === clip.id) as MediaClip;
              delete c.grade;
              delete c.color;
              delete c.look;
            })
          }
        >
          <RotateCcw size={12} />
        </button>
      </div>

      <div className="looks">
        {GRADE_LOOKS.map((l) => (
          <button
            key={l.id}
            className={`look ${clip.look === l.id ? 'on' : ''}`}
            onClick={() =>
              b.change((p) => {
                const c = p.clips.find((x) => x.id === clip.id) as MediaClip;
                delete c.color;
                if (l.id === 'natural') {
                  delete c.grade;
                  delete c.look;
                  return;
                }
                c.grade = { ...defaultGrade(), ...l.grade, lut: c.grade?.lut, lutAmount: c.grade?.lutAmount ?? 1 };
                c.look = l.id;
              })
            }
          >
            <span style={{ background: l.swatch }} />
            {l.name}
          </button>
        ))}
      </div>

      <div className="lumetri-group">Básico</div>
      {slider('Exposición', 'exposure', -2, 2)}
      {slider('Contraste', 'contrast', -1, 1)}
      {slider('Altas luces', 'highlights', -1, 1)}
      {slider('Sombras', 'shadows', -1, 1)}
      {slider('Temperatura', 'temperature', -1, 1)}
      {slider('Matiz', 'tint', -1, 1)}
      {slider('Saturación', 'saturation', 0, 2)}
      {slider('Intensidad', 'vibrance', -1, 1)}

      <div className="lumetri-group">Creativo</div>
      <div className="field">
        <label>LUT</label>
        <div style={{ display: 'flex', gap: 4, minWidth: 0 }}>
          <select style={{ flex: 1, minWidth: 0 }} value={g.lut ?? ''} onChange={(e) => editGrade(b, clip.id, (gr) => (e.target.value ? (gr.lut = e.target.value) : delete gr.lut))}>
            <option value="">Ninguna</option>
            {luts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button className="btn sm" title="Importar una LUT .cube" onClick={() => fileRef.current?.click()}>
            <Upload size={12} />
          </button>
          <input ref={fileRef} type="file" accept=".cube" hidden onChange={(e) => importLut([...(e.target.files ?? [])])} />
        </div>
      </div>
      {g.lut && slider('Intensidad LUT', 'lutAmount', 0, 1)}
      {slider('Película desvaída', 'fade', 0, 1)}

      <div className="lumetri-group">Ruedas de color</div>
      <div className="wheels">
        <ColorWheel label="Sombras" value={g.lift} b={b} onChange={(w) => editGrade(b, clip.id, (gr) => (gr.lift = w))} />
        <ColorWheel label="Medios" value={g.gamma} b={b} onChange={(w) => editGrade(b, clip.id, (gr) => (gr.gamma = w))} />
        <ColorWheel label="Luces" value={g.gain} b={b} onChange={(w) => editGrade(b, clip.id, (gr) => (gr.gain = w))} />
      </div>

      <div className="lumetri-group">Scopes</div>
      <Scopes clipId={clip.id} />
    </div>
  );
}
