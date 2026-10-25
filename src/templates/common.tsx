import type { CSSProperties, ReactNode } from 'react';
import {
  Bell,
  Bot,
  Brain,
  Camera,
  Check,
  Flame,
  Heart,
  Lightbulb,
  Lock,
  Play,
  Rocket,
  Sparkles,
  Star,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Asset, FormatId } from '../../shared/types';
import { ImageView, VideoView, assetUrl } from '../engine/media';

export interface TplProps {
  props: Record<string, any>;
  t: number;
  dur: number;
  W: number;
  H: number;
  u: number;
  pin: number;
  pout: number;
  format: FormatId;
  vertical: boolean;
  projectId: string;
  assets: Asset[];
  playing: boolean;
  visible: boolean;
}

export const ICON_MAP: Record<string, LucideIcon> = {
  lock: Lock,
  sparkles: Sparkles,
  zap: Zap,
  star: Star,
  play: Play,
  check: Check,
  flame: Flame,
  rocket: Rocket,
  bell: Bell,
  heart: Heart,
  brain: Brain,
  bot: Bot,
  camera: Camera,
  trophy: Trophy,
  lightbulb: Lightbulb,
};

/** Márgenes seguros: en vertical se deja sitio a la interfaz de Reels/TikTok. */
export function safeMargins(W: number, H: number, vertical: boolean) {
  return {
    x: W * 0.055,
    top: vertical ? H * 0.11 : H * 0.08,
    bottom: vertical ? H * 0.21 : H * 0.11,
  };
}

/** Coloca un bloque en una de las posiciones predefinidas. */
export function Anchor({
  position,
  W,
  H,
  vertical,
  children,
  style,
}: {
  position: string;
  W: number;
  H: number;
  vertical: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const m = safeMargins(W, H, vertical);
  const s: CSSProperties = { position: 'absolute', display: 'flex' };
  const [v, h] = position === 'center' ? ['center', 'center'] : position.split('-');
  if (v === 'top') s.top = m.top;
  else if (v === 'bottom') s.bottom = m.bottom;
  else {
    s.top = 0;
    s.bottom = 0;
    s.alignItems = 'center';
  }
  if (h === 'left') {
    s.left = m.x;
    s.justifyContent = 'flex-start';
  } else if (h === 'right') {
    s.right = m.x;
    s.justifyContent = 'flex-end';
  } else {
    s.left = 0;
    s.right = 0;
    s.justifyContent = 'center';
  }
  return <div style={{ ...s, ...style }}>{children}</div>;
}

/** Medio dentro de un panel (pantalla dividida, tríptico...). */
export function PanelMedia({
  projectId,
  assets,
  assetId,
  inPoint,
  t,
  playing,
  visible,
  label,
}: {
  projectId: string;
  assets: Asset[];
  assetId: string;
  inPoint: number;
  t: number;
  playing: boolean;
  visible: boolean;
  label?: string;
}) {
  const asset = assets.find((a) => a.id === assetId);
  const fill: CSSProperties = { left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover' };
  if (!asset || asset.status === 'error') {
    return <div className="tpl-placeholder">{label ?? 'Elige un medio'}</div>;
  }
  if (asset.type === 'image') return <ImageView src={assetUrl(projectId, asset)} style={fill} />;
  if (asset.type === 'video') {
    const st = Math.min(Math.max(0, inPoint + t), Math.max(0, asset.duration - 0.05));
    return <VideoView src={assetUrl(projectId, asset)} sourceTime={st} active={visible} playing={playing} style={fill} />;
  }
  return <div className="tpl-placeholder">{asset.name}</div>;
}

/** Divide un texto en palabras resaltando las que van entre *asteriscos*. */
export function parseAccent(text: string): { word: string; accent: boolean }[] {
  const out: { word: string; accent: boolean }[] = [];
  let accent = false;
  for (const raw of String(text ?? '').split(/(\s+)/)) {
    if (!raw) continue;
    if (/^\s+$/.test(raw)) {
      out.push({ word: raw, accent: false });
      continue;
    }
    let w = raw;
    const opens = w.startsWith('*');
    if (opens) {
      accent = true;
      w = w.slice(1);
    }
    const closes = w.endsWith('*');
    if (closes) w = w.slice(0, -1);
    out.push({ word: w, accent });
    if (closes) accent = false;
  }
  return out;
}
