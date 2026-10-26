import { useEffect } from 'react';
import {
  ArrowLeftRight,
  AudioWaveform,
  BetweenHorizontalStart,
  Copy,
  Mic,
  PictureInPicture2,
  ScanFace,
  Scissors,
  Sparkles,
  Trash2,
  Unlink,
} from 'lucide-react';
import type { MediaClip } from '../../shared/types';
import { defaultTransform, deleteClips, duplicateClip, splitAt, unlinkAudio } from '../../shared/ops';
import { useEditor } from '../store';
import { openSource } from './SourceMonitor';
import { autoReframe, removeSilences } from './util';

export interface CtxMenuState {
  x: number;
  y: number;
  clipId: string;
}

/** Ajustes de picture-in-picture: esquina superior derecha, bordes redondeados y sombra. */
export function applyPip(c: MediaClip) {
  c.transform = { ...defaultTransform(), scale: 0.36, x: 0.27, y: -0.25 };
  c.radius = 36;
  c.shadow = 0.8;
  c.border = { width: 4, color: '#ffffff' };
  delete c.crop;
}

export function ContextMenu({ menu, onClose }: { menu: CtxMenuState; onClose: () => void }) {
  const project = useEditor((s) => s.project)!;
  const st = useEditor.getState();
  const clip = project.clips.find((c) => c.id === menu.clipId);
  const asset = clip && 'assetId' in clip ? project.assets.find((a) => a.id === clip.assetId) : undefined;

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);

  if (!clip) return null;
  const isMediaVisual = clip.type === 'video' || clip.type === 'image';
  const hasSound = (clip.type === 'video' || clip.type === 'audio') && !!asset?.hasAudio;
  const edit = (fn: (c: any) => void) => st.commit((p) => { const c = p.clips.find((x) => x.id === clip.id); if (c) fn(c); });

  const items: ({ label: string; icon: any; run: () => void; danger?: boolean; hint?: string } | '-')[] = [
    { label: 'Cortar en el cabezal', icon: Scissors, hint: 'S', run: () => st.commit((p) => splitAt(p, st.time, [clip.id])) },
    { label: 'Duplicar', icon: Copy, hint: '⌘D', run: () => { let id: string | null = null; st.commit((p) => (id = duplicateClip(p, clip.id))); if (id) st.select([id]); } },
  ];
  if (asset && clip.type !== 'audio') items.push({ label: 'Abrir en el monitor de origen', icon: BetweenHorizontalStart, run: () => openSource(asset.id) });
  if (hasSound) {
    items.push('-');
    items.push({ label: 'Quitar silencios', icon: AudioWaveform, run: () => removeSilences(clip.id) });
    items.push({
      label: (clip as MediaClip).enhance ? 'Desactivar «Mejorar voz»' : 'Mejorar voz',
      icon: Mic,
      run: () => edit((c) => (c.enhance = !c.enhance)),
    });
    if (clip.type === 'video' && clip.volume > 0)
      items.push({ label: 'Desvincular audio', icon: Unlink, run: () => { let id: string | null = null; st.commit((p) => (id = unlinkAudio(p, clip.id))); if (id) st.notify('Audio separado en su propia pista'); } });
  }
  if (isMediaVisual) {
    items.push('-');
    if (clip.type === 'video')
      items.push({ label: 'Auto Reframe (seguir la cara)', icon: ScanFace, run: () => autoReframe([clip.id]).catch((e) => st.notify(String(e.message), 'error')) });
    items.push({ label: 'Picture-in-picture', icon: PictureInPicture2, run: () => edit(applyPip) });
    items.push({ label: 'Transición: fundido cruzado', icon: Sparkles, run: () => edit((c) => (c.transitionIn = { type: 'fade', duration: 0.6 })) });
    items.push({ label: 'Transición: barrido rápido', icon: Sparkles, run: () => edit((c) => (c.transitionIn = { type: 'whip', duration: 0.4 })) });
  }
  items.push('-');
  items.push({ label: 'Borrar', icon: Trash2, hint: '⌫', danger: true, run: () => { st.commit((p) => deleteClips(p, [clip.id])); st.select([]); } });
  items.push({ label: 'Borrar y cerrar hueco', icon: ArrowLeftRight, hint: '⇧⌫', danger: true, run: () => { st.commit((p) => deleteClips(p, [clip.id], true)); st.select([]); } });

  const x = Math.min(menu.x, window.innerWidth - 250);
  const y = Math.min(menu.y, window.innerHeight - items.length * 30 - 20);
  return (
    <div className="ctx-menu" style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()}>
      {items.map((it, i) =>
        it === '-' ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <button
            key={i}
            className={`ctx-item ${it.danger ? 'danger' : ''}`}
            onClick={() => {
              it.run();
              onClose();
            }}
          >
            <it.icon size={14} />
            <span>{it.label}</span>
            {it.hint && <kbd>{it.hint}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
