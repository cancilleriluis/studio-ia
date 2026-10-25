// Vista sin interfaz que usa el exportador (Chrome sin ventana) para capturar
// cada fotograma con exactamente el mismo motor que el editor.

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import type { FormatId, Project } from '../shared/types';
import { normalizeProject } from '../shared/ops';
import { api } from './api';
import { Stage } from './engine/Stage';
import { settle } from './engine/renderSync';

declare global {
  interface Window {
    __studio?: { ready: boolean; seek: (t: number) => Promise<void> };
  }
}

export function RenderView() {
  const params = new URLSearchParams(location.search);
  const id = params.get('project')!;
  const format = (params.get('format') ?? undefined) as FormatId | undefined;
  const [project, setProject] = useState<Project | null>(null);
  const [time, setTime] = useState(0);

  useEffect(() => {
    document.body.style.background = '#000';
    api.project(id).then((p) => setProject(normalizeProject(p)));
  }, [id]);

  useEffect(() => {
    if (!project) return;
    window.__studio = {
      ready: false,
      seek: async (t: number) => {
        flushSync(() => setTime(t));
        await settle();
      },
    };
    settle().then(() => (window.__studio!.ready = true));
  }, [project]);

  if (!project) return null;
  return (
    <div style={{ position: 'fixed', left: 0, top: 0 }}>
      <Stage project={project} format={format} time={time} playing={false} />
    </div>
  );
}
