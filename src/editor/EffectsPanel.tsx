import { ArrowRightLeft, Contrast, Focus, Sun, Vibrate, Wand2, ZoomIn, Circle } from 'lucide-react';
import type { MediaClip, TransitionId } from '../../shared/types';
import { EFFECTS, TRANSITIONS } from '../../shared/registry';
import { useEditor } from '../store';
import { DRAG_MIME } from './Timeline';
import { addEffectAt } from './util';

const FX_ICONS: Record<string, any> = { zoom: ZoomIn, shake: Vibrate, flash: Sun, blur: Focus, grade: Contrast, vignette: Circle };

export function EffectsPanel() {
  const selection = useEditor((s) => s.selection);
  const project = useEditor((s) => s.project)!;
  const st = useEditor.getState();
  const targets = project.clips.filter((c): c is MediaClip => selection.includes(c.id) && (c.type === 'video' || c.type === 'image'));

  const applyTransition = (id: TransitionId) => {
    if (!targets.length) {
      st.notify('Selecciona un clip de vídeo o imagen para aplicar la transición (o arrástrala sobre él)');
      return;
    }
    st.commit((p) => {
      for (const t of targets) {
        const c = p.clips.find((x) => x.id === t.id) as MediaClip;
        c.transitionIn = { type: id, duration: c.transitionIn?.duration ?? 0.6 };
      }
    });
  };

  return (
    <div className="panel-body">
      <div className="section">
        <div className="section-title">Efectos de cámara y color</div>
        <div className="hint" style={{ marginBottom: 10 }}>Se colocan en una pista superior y afectan a todo lo que hay debajo, como una capa de ajuste.</div>
        {EFFECTS.map((e) => {
          const Icon = FX_ICONS[e.id] ?? Wand2;
          return (
            <div
              key={e.id}
              className="fx-item"
              draggable
              onDragStart={(ev) => ev.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'effect', id: e.id }))}
              onClick={() => addEffectAt(e.id)}
            >
              <div className="fx-dot" style={{ background: 'color-mix(in srgb, var(--c-effect) 22%, transparent)', color: 'var(--c-effect)' }}>
                <Icon size={14} />
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{e.name}</div>
                <div className="desc">{e.description}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="section">
        <div className="section-title">Transiciones</div>
        <div className="hint" style={{ marginBottom: 10 }}>
          {targets.length ? `Se aplicará a ${targets.length} clip(s) seleccionado(s).` : 'Selecciona un clip o arrastra la transición sobre él.'}
        </div>
        {TRANSITIONS.map((t) => (
          <div
            key={t.id}
            className="fx-item"
            draggable
            onDragStart={(ev) => ev.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'transition', id: t.id }))}
            onClick={() => applyTransition(t.id)}
          >
            <div className="fx-dot" style={{ background: 'color-mix(in srgb, var(--c-video) 22%, transparent)', color: 'var(--c-video)' }}>
              <ArrowRightLeft size={14} />
            </div>
            <div style={{ fontWeight: 600 }}>{t.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
