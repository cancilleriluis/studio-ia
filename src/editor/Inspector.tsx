import { AudioWaveform, Copy, Crosshair, Keyboard, RotateCcw, Trash2 } from 'lucide-react';
import type { AnimId, AudioClip, Clip, ColorAdjust, EffectClip, MediaClip, Project, TemplateClip, TransitionId } from '../../shared/types';
import { ANIMS, TRANSITIONS, getEffect, getTemplate } from '../../shared/registry';
import { FORMATS } from '../../shared/formats';
import { defaultTransform, deleteClips, duplicateClip, maxSourceDuration } from '../../shared/ops';
import { useEditor } from '../store';
import { ColorInput, FieldControl, NumberInput, Toggle, useBinder, type Binder } from './controls';
import { CLIP_COLORS, removeSilences } from './util';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">
        {title}
        {action}
      </div>
      {children}
    </div>
  );
}

/** Edita el clip `id` dentro del proyecto. */
const editClip = <T extends Clip>(b: Binder, id: string, fn: (c: T, p: Project) => void) =>
  b.change((p) => {
    const c = p.clips.find((x) => x.id === id) as T | undefined;
    if (c) fn(c, p);
  });

function Num({ b, label, value, min, max, step, set }: { b: Binder; label: string; value: number; min: number; max: number; step: number; set: (v: number) => void }) {
  return (
    <Field label={label}>
      <NumberInput value={value} min={min} max={max} step={step} onBegin={b.begin} onEnd={b.end} onChange={set} />
    </Field>
  );
}

function TransformSection({ clip, b }: { clip: MediaClip | TemplateClip; b: Binder }) {
  const t = clip.transform;
  const set = (k: keyof typeof t) => (v: number) => editClip<MediaClip>(b, clip.id, (c) => (c.transform[k] = v));
  return (
    <Section
      title="Transformación"
      action={
        <button className="icon-btn sm" title="Restablecer" onClick={() => editClip<MediaClip>(b, clip.id, (c) => (c.transform = defaultTransform()))}>
          <RotateCcw size={12} />
        </button>
      }
    >
      <Num b={b} label="Posición X" value={t.x} min={-1} max={1} step={0.005} set={set('x')} />
      <Num b={b} label="Posición Y" value={t.y} min={-1} max={1} step={0.005} set={set('y')} />
      <Num b={b} label="Escala" value={t.scale} min={0.1} max={4} step={0.01} set={set('scale')} />
      <Num b={b} label="Rotación" value={t.rotation} min={-180} max={180} step={0.5} set={set('rotation')} />
      <Num b={b} label="Opacidad" value={t.opacity} min={0} max={1} step={0.01} set={set('opacity')} />
    </Section>
  );
}

function TimingSection({ clip, b, fps }: { clip: Clip; b: Binder; fps: number }) {
  return (
    <Section title="Tiempo">
      <Field label="Inicio (s)">
        <input type="number" step={1 / fps} value={Number(clip.start.toFixed(3))} onChange={(e) => editClip(b, clip.id, (c) => (c.start = Math.max(0, Number(e.target.value))))} />
      </Field>
      <Field label="Duración (s)">
        <input
          type="number"
          step={1 / fps}
          value={Number(clip.duration.toFixed(3))}
          onChange={(e) =>
            editClip(b, clip.id, (c, p) => {
              const max = 'speed' in c ? (maxSourceDuration(p, c) - c.in) / c.speed : Infinity;
              c.duration = Math.max(0.1, Math.min(max, Number(e.target.value)));
            })
          }
        />
      </Field>
    </Section>
  );
}

function AudioSection({ clip, b }: { clip: MediaClip | AudioClip; b: Binder }) {
  return (
    <Section title="Audio">
      <Num b={b} label="Volumen" value={clip.volume} min={0} max={2} step={0.01} set={(v) => editClip<AudioClip>(b, clip.id, (c) => (c.volume = v))} />
      <Num b={b} label="Fundido entrada" value={clip.fadeIn} min={0} max={5} step={0.05} set={(v) => editClip<AudioClip>(b, clip.id, (c) => (c.fadeIn = v))} />
      <Num b={b} label="Fundido salida" value={clip.fadeOut} min={0} max={5} step={0.05} set={(v) => editClip<AudioClip>(b, clip.id, (c) => (c.fadeOut = v))} />
      {clip.type === 'audio' && (
        <Field label="Ducking">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Toggle value={clip.duck} onChange={(v) => editClip<AudioClip>(b, clip.id, (c) => (c.duck = v))} />
            <span className="hint">Baja la música cuando hablas</span>
          </div>
        </Field>
      )}
    </Section>
  );
}

function SpeedField({ clip, b }: { clip: MediaClip | AudioClip; b: Binder }) {
  return (
    <Num
      b={b}
      label="Velocidad"
      value={clip.speed}
      min={0.25}
      max={4}
      step={0.05}
      set={(v) =>
        editClip<AudioClip>(b, clip.id, (c, p) => {
          const span = c.duration * c.speed;
          c.speed = v;
          c.duration = Math.min(span / v, (maxSourceDuration(p, c) - c.in) / v);
        })
      }
    />
  );
}

function MediaInspector({ clip, project, b }: { clip: MediaClip; project: Project; b: Binder }) {
  const fmt = project.format;
  const fr = { x: 0.5, y: 0.5, zoom: 1, ...(clip.framing[fmt] ?? {}) };
  const setFr = (k: 'x' | 'y' | 'zoom') => (v: number) => editClip<MediaClip>(b, clip.id, (c) => (c.framing[fmt] = { ...fr, ...(c.framing[fmt] ?? {}), [k]: v }));
  const col: ColorAdjust = clip.color ?? { brightness: 1, contrast: 1, saturation: 1, warmth: 0 };
  const setCol = (k: keyof ColorAdjust) => (v: number) => editClip<MediaClip>(b, clip.id, (c) => (c.color = { ...col, ...(c.color ?? {}), [k]: v }));
  const asset = project.assets.find((a) => a.id === clip.assetId);
  return (
    <>
      <Section
        title={`Encuadre en ${FORMATS[fmt].label}`}
        action={
          <button className="icon-btn sm" title="Centrar" onClick={() => editClip<MediaClip>(b, clip.id, (c) => delete c.framing[fmt])}>
            <Crosshair size={12} />
          </button>
        }
      >
        <Field label="Ajuste">
          <div className="seg">
            {(['cover', 'contain'] as const).map((f) => (
              <button key={f} className={clip.fit === f ? 'on' : ''} onClick={() => editClip<MediaClip>(b, clip.id, (c) => (c.fit = f))}>
                {f === 'cover' ? 'Rellenar' : 'Encajar'}
              </button>
            ))}
          </div>
        </Field>
        <Num b={b} label="Zoom" value={fr.zoom} min={1} max={4} step={0.01} set={setFr('zoom')} />
        <Num b={b} label="Foco X" value={fr.x} min={0} max={1} step={0.005} set={setFr('x')} />
        <Num b={b} label="Foco Y" value={fr.y} min={0} max={1} step={0.005} set={setFr('y')} />
        <div className="hint">Cada formato guarda su propio encuadre. También puedes arrastrar sobre el monitor.</div>
      </Section>
      <Section title="Transición de entrada">
        <Field label="Tipo">
          <select
            value={clip.transitionIn?.type ?? ''}
            onChange={(e) =>
              editClip<MediaClip>(b, clip.id, (c) => {
                if (!e.target.value) delete c.transitionIn;
                else c.transitionIn = { type: e.target.value as TransitionId, duration: c.transitionIn?.duration ?? 0.6 };
              })
            }
          >
            <option value="">Corte directo</option>
            {TRANSITIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        {clip.transitionIn && (
          <Num b={b} label="Duración" value={clip.transitionIn.duration} min={0.1} max={2.5} step={0.05} set={(v) => editClip<MediaClip>(b, clip.id, (c) => c.transitionIn && (c.transitionIn.duration = v))} />
        )}
      </Section>
      {clip.type === 'video' && (
        <Section title="Reproducción">
          <SpeedField clip={clip} b={b} />
        </Section>
      )}
      {clip.type === 'video' && asset?.hasAudio && <AudioSection clip={clip} b={b} />}
      {clip.type === 'video' && asset?.hasAudio && (
        <div className="section">
          <button className="btn block" onClick={() => removeSilences(clip.id)}>
            <AudioWaveform size={14} /> Quitar silencios (jump cuts)
          </button>
        </div>
      )}
      {clip.type === 'image' && (
        <Section title="Movimiento">
          <Field label="Ken Burns">
            <Toggle value={!!clip.kenBurns} onChange={(v) => editClip<MediaClip>(b, clip.id, (c) => (c.kenBurns = v))} />
          </Field>
        </Section>
      )}
      <Section
        title="Color"
        action={
          <button className="icon-btn sm" title="Restablecer" onClick={() => editClip<MediaClip>(b, clip.id, (c) => delete c.color)}>
            <RotateCcw size={12} />
          </button>
        }
      >
        <Num b={b} label="Brillo" value={col.brightness} min={0.3} max={2} step={0.01} set={setCol('brightness')} />
        <Num b={b} label="Contraste" value={col.contrast} min={0.3} max={2} step={0.01} set={setCol('contrast')} />
        <Num b={b} label="Saturación" value={col.saturation} min={0} max={3} step={0.01} set={setCol('saturation')} />
        <Num b={b} label="Calidez" value={col.warmth} min={-1} max={1} step={0.01} set={setCol('warmth')} />
      </Section>
      <TransformSection clip={clip} b={b} />
    </>
  );
}

function TemplateInspector({ clip, b }: { clip: TemplateClip; b: Binder }) {
  const def = getTemplate(clip.template);
  const live = { onBegin: b.begin, onEnd: b.end };
  return (
    <>
      <Section title={def?.name ?? clip.template}>
        {def?.fields.map((f) => (
          <div key={f.key} className={`field ${f.type === 'panels' || f.type === 'icon' || f.type === 'textarea' ? 'stack' : ''}`}>
            <label>{f.label}</label>
            <FieldControl field={f} value={clip.props[f.key]} live={live} onChange={(v) => editClip<TemplateClip>(b, clip.id, (c) => (c.props[f.key] = v))} />
          </div>
        ))}
        {clip.template === 'title-card' && <div className="hint">Escribe *entre asteriscos* las palabras que quieras resaltar.</div>}
      </Section>
      <Section title="Animación">
        <Field label="Entrada">
          <select value={clip.animIn} onChange={(e) => editClip<TemplateClip>(b, clip.id, (c) => (c.animIn = e.target.value as AnimId))}>
            {ANIMS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Num b={b} label="Duración ent." value={clip.inDuration} min={0} max={2} step={0.05} set={(v) => editClip<TemplateClip>(b, clip.id, (c) => (c.inDuration = v))} />
        <Field label="Salida">
          <select value={clip.animOut} onChange={(e) => editClip<TemplateClip>(b, clip.id, (c) => (c.animOut = e.target.value as AnimId))}>
            {ANIMS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Num b={b} label="Duración sal." value={clip.outDuration} min={0} max={2} step={0.05} set={(v) => editClip<TemplateClip>(b, clip.id, (c) => (c.outDuration = v))} />
      </Section>
      <TransformSection clip={clip} b={b} />
    </>
  );
}

function EffectInspector({ clip, b }: { clip: EffectClip; b: Binder }) {
  const def = getEffect(clip.effect);
  const live = { onBegin: b.begin, onEnd: b.end };
  return (
    <Section title={def?.name ?? clip.effect}>
      <div className="hint" style={{ marginBottom: 10 }}>{def?.description}</div>
      {def?.fields.map((f) => (
        <div key={f.key} className="field">
          <label>{f.label}</label>
          <FieldControl field={f} value={clip.props[f.key]} live={live} onChange={(v) => editClip<EffectClip>(b, clip.id, (c) => (c.props[f.key] = v))} />
        </div>
      ))}
      {clip.effect === 'zoom' && <div className="hint">Foco 0,5 / 0,38 ≈ la cara en un plano medio.</div>}
    </Section>
  );
}

function ProjectSettings({ project, b }: { project: Project; b: Binder }) {
  return (
    <>
      <Section title="Proyecto">
        <Field label="Fotogramas/s">
          <select value={project.fps} onChange={(e) => b.change((p) => (p.fps = Number(e.target.value)))}>
            {[24, 25, 30, 50, 60].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fondo">
          <ColorInput value={project.background} onBegin={b.begin} onEnd={b.end} onChange={(v) => b.change((p) => (p.background = v))} />
        </Field>
      </Section>
      <Section title="Mezcla de audio">
        <Num b={b} label="Volumen general" value={project.audio.master} min={0} max={2} step={0.01} set={(v) => b.change((p) => (p.audio.master = v))} />
        <Num b={b} label="Ducking música" value={project.audio.duckLevel} min={0} max={1} step={0.01} set={(v) => b.change((p) => (p.audio.duckLevel = v))} />
      </Section>
      <Section title="Atajos">
        <div className="hint" style={{ lineHeight: 1.9 }}>
          <Keyboard size={12} /> Espacio reproducir · J/K/L · ←/→ fotograma (⇧ 1 s)
          <br />S o ⌘K cortar · C cuchilla · V selección
          <br />Q / W recortar al cabezal (ripple) · ⌫ borrar · ⇧⌫ ripple
          <br />⌘Z deshacer · ⇧⌘Z rehacer · ⌘D duplicar · ⌘C / ⌘V
          <br />↑/↓ ir al corte anterior/siguiente · M marcador
          <br />⌘ + rueda: zoom de la línea de tiempo
        </div>
      </Section>
    </>
  );
}

export function Inspector() {
  const project = useEditor((s) => s.project)!;
  const selection = useEditor((s) => s.selection);
  const b = useBinder();
  const st = useEditor.getState();
  const clips = project.clips.filter((c) => selection.includes(c.id));

  if (!clips.length)
    return (
      <div className="panel-body">
        <ProjectSettings project={project} b={b} />
      </div>
    );
  if (clips.length > 1)
    return (
      <div className="panel-body">
        <div className="empty">{clips.length} clips seleccionados</div>
        <button className="btn block" onClick={() => { st.commit((p) => deleteClips(p, selection)); st.select([]); }}>
          <Trash2 size={14} /> Borrar selección
        </button>
      </div>
    );

  const clip = clips[0];
  const asset = 'assetId' in clip ? project.assets.find((a) => a.id === clip.assetId) : undefined;
  const title =
    clip.type === 'template' ? getTemplate(clip.template)?.name : clip.type === 'effect' ? getEffect(clip.effect)?.name : asset?.name ?? clip.name;

  return (
    <div className="panel-body" key={clip.id}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: CLIP_COLORS[clip.type], flex: 'none' }} />
        <div style={{ fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <button className="icon-btn sm" title="Duplicar (⌘D)" onClick={() => { let id: string | null = null; st.commit((p) => (id = duplicateClip(p, clip.id))); if (id) st.select([id]); }}>
          <Copy size={13} />
        </button>
        <button className="icon-btn sm" title="Borrar (⌫)" onClick={() => { st.commit((p) => deleteClips(p, [clip.id])); st.select([]); }}>
          <Trash2 size={13} />
        </button>
      </div>
      <TimingSection clip={clip} b={b} fps={project.fps} />
      {(clip.type === 'video' || clip.type === 'image') && <MediaInspector clip={clip} project={project} b={b} />}
      {clip.type === 'audio' && (
        <>
          <Section title="Reproducción">
            <SpeedField clip={clip} b={b} />
          </Section>
          <AudioSection clip={clip} b={b} />
        </>
      )}
      {clip.type === 'template' && <TemplateInspector clip={clip} b={b} />}
      {clip.type === 'effect' && <EffectInspector clip={clip} b={b} />}
    </div>
  );
}
