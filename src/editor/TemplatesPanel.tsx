import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, TemplateClip } from '../../shared/types';
import { TEMPLATES, type TemplateDef, defaultsFor } from '../../shared/registry';
import { defaultTransform } from '../../shared/ops';
import { Stage } from '../engine/Stage';
import { useEditor } from '../store';
import { DRAG_MIME } from './Timeline';
import { addTemplateAt } from './util';

/** Mini proyecto para previsualizar una plantilla en bucle. */
function demoProject(def: TemplateDef, base: Project): Project {
  const media = base.assets.filter((a) => (a.type === 'video' || a.type === 'image') && a.status === 'ready');
  const props = defaultsFor(def.fields);
  if (props.panels && media.length) props.panels = props.panels.map((p: any, i: number) => ({ ...p, assetId: media[i % media.length].id, in: i * 2 }));
  const clips: Project['clips'] = [];
  if (media[0] && def.id !== 'split-screen' && def.id !== 'triptych') {
    clips.push({
      id: 'bg', type: media[0].type as 'video', trackId: 'v1', start: 0, duration: 999, assetId: media[0].id, in: 1, speed: 1,
      volume: 0, fadeIn: 0, fadeOut: 0, fit: 'cover', framing: {}, transform: defaultTransform(),
    });
  }
  const tpl: TemplateClip = {
    id: 'tpl', type: 'template', template: def.id, trackId: 'v2', start: 0, duration: def.defaultDuration, props,
    transform: defaultTransform(), animIn: def.animIn, animOut: def.animOut, inDuration: 0.55, outDuration: 0.4,
  };
  clips.push(tpl);
  return {
    ...base,
    format: '16:9',
    background: media[0] ? '#000' : '#2a2f3a',
    tracks: [{ id: 'v2', name: 'V2', kind: 'visual' }, { id: 'v1', name: 'V1', kind: 'visual' }],
    clips,
    captions: { ...base.captions, enabled: false, segments: [] },
  };
}

function TemplateCard({ def, project }: { def: TemplateDef; project: Project }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [t, setT] = useState(def.defaultDuration * 0.55);
  const [w, setW] = useState(130);
  const demo = useMemo(() => demoProject(def, project), [def, project.assets]);
  useEffect(() => {
    if (ref.current) setW(ref.current.clientWidth);
  }, []);
  useEffect(() => {
    if (!hover) {
      setT(Math.min(def.defaultDuration * 0.55, 1.6));
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      setT(((now - t0) / 1000) % (def.defaultDuration + 0.4));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hover, def.defaultDuration]);
  const scale = w / 1920;
  return (
    <div
      className="tpl-card"
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'template', id: def.id }))}
      onClick={() => addTemplateAt(def.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${def.description}\nClic: añadir en el cabezal · Arrastra a una pista`}
    >
      <div className="tpl-preview" ref={ref}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: 1920, height: 1080, pointerEvents: 'none' }}>
          <Stage project={demo} time={t} playing={false} captions={false} />
        </div>
      </div>
      <div className="tpl-card-name">{def.name}</div>
    </div>
  );
}

export function TemplatesPanel() {
  const project = useEditor((s) => s.project)!;
  const groups = useMemo(() => {
    const g: Record<string, TemplateDef[]> = {};
    for (const t of TEMPLATES) (g[t.category] ??= []).push(t);
    return g;
  }, []);
  return (
    <div className="panel-body">
      <div className="hint" style={{ marginBottom: 12 }}>Pasa el ratón para verlas animadas. Clic para añadir en el cabezal o arrastra a una pista.</div>
      {Object.entries(groups).map(([cat, defs]) => (
        <div className="section" key={cat}>
          <div className="section-title">{cat}</div>
          <div className="tpl-grid">
            {defs.map((d) => (
              <TemplateCard key={d.id} def={d} project={project} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
