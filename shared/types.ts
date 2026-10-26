// Modelo de datos del proyecto. Todo el estado de una edición vive en un
// único project.json legible, para que el editor y la IA lo puedan modificar.

export type FormatId = '16:9' | '9:16' | '1:1' | '4:5';

export type AssetType = 'video' | 'audio' | 'image' | 'lut';

export interface Filmstrip {
  file: string; // sprite relativo a la carpeta media del proyecto
  interval: number; // segundos entre fotogramas
  tileW: number;
  tileH: number;
  count: number;
  cols: number;
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  file: string; // ruta relativa dentro de media/
  proxy?: string; // versión de edición (H.264 intra) para vídeo
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  waveform?: string; // json con picos de audio
  filmstrip?: Filmstrip;
  transcript?: string; // json con palabras (tiempo de la fuente)
  /** Posición de la cara (0..1 del fotograma) muestreada a `rate` Hz y ya suavizada, para Auto Reframe. */
  faceTrack?: { rate: number; points: [number, number][] };
  transcriptStatus?: 'none' | 'processing' | 'ready' | 'error';
  status: 'processing' | 'ready' | 'error';
  progress?: number;
  error?: string;
}

export interface Track {
  id: string;
  name: string;
  kind: 'visual' | 'audio';
  muted?: boolean;
  hidden?: boolean;
  locked?: boolean;
}

/** Desplazamiento/escala de un elemento gráfico. x,y en fracción del lienzo (0 = posición por defecto). */
export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

/** Encuadre de un medio dentro del lienzo: punto de foco (0..1 de la fuente) y zoom. */
export interface Framing {
  x: number;
  y: number;
  zoom: number;
}

export type TransitionId =
  | 'fade'
  | 'dip-black'
  | 'dip-white'
  | 'zoom'
  | 'slide-left'
  | 'slide-up'
  | 'blur'
  | 'whip';

export interface Transition {
  type: TransitionId;
  duration: number;
}

/** Rueda de color: tono en grados (0..360) y cantidad (0..1). */
export type Wheel = [number, number];

/** Corrección de color tipo Lumetri (procesada con WebGL). */
export interface Grade {
  exposure: number; // −2..2 pasos
  contrast: number; // −1..1
  highlights: number; // −1..1
  shadows: number; // −1..1
  temperature: number; // −1..1 (frío ↔ cálido)
  tint: number; // −1..1 (verde ↔ magenta)
  saturation: number; // 0..2
  vibrance: number; // −1..1
  lift: Wheel; // sombras
  gamma: Wheel; // medios tonos
  gain: Wheel; // altas luces
  fade: number; // 0..1, película desvaída
  lut?: string; // id de un medio de tipo 'lut' (.cube)
  lutAmount: number; // 0..1
}

export interface ColorAdjust {
  brightness: number; // 1 = neutro
  contrast: number;
  saturation: number;
  warmth: number; // -1..1
}

/** Propiedades animables con fotogramas clave. */
export type KfProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'volume';

export interface Keyframe {
  t: number; // segundos desde el inicio del clip
  v: number;
  ease?: 'ease' | 'linear' | 'hold'; // interpolación hacia el siguiente
}

export type Keyframes = Partial<Record<KfProp, Keyframe[]>>;

/** Recorte en fracción del lienzo (0..0.5 por lado). */
export interface Crop {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface ClipBase {
  id: string;
  trackId: string;
  start: number; // segundo en la línea de tiempo
  duration: number; // segundos en la línea de tiempo
  name?: string;
}

export interface MediaClip extends ClipBase {
  type: 'video' | 'image';
  assetId: string;
  in: number; // segundo de inicio en la fuente
  speed: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  fit: 'cover' | 'contain';
  framing: Partial<Record<FormatId, Framing>>;
  transform: Transform;
  transitionIn?: Transition;
  color?: ColorAdjust;
  /** Movimiento lento automático tipo Ken Burns (solo imágenes). */
  kenBurns?: boolean;
  keyframes?: Keyframes;
  crop?: Crop;
  /** Radio de las esquinas en px de un lienzo de 1080 (picture-in-picture). */
  radius?: number;
  border?: { width: number; color: string };
  /** Sombra 0..1 */
  shadow?: number;
  /** Mejorar voz: filtro de graves, reducción de ruido, compresor y presencia. */
  enhance?: boolean;
  /** Look de color aplicado (solo informativo para la interfaz). */
  look?: string;
  grade?: Grade;
  /** Auto Reframe: el encuadre sigue la cara detectada en el medio. */
  autoReframe?: boolean;
}

export interface AudioClip extends ClipBase {
  type: 'audio';
  assetId: string;
  in: number;
  speed: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  /** Bajar automáticamente el volumen cuando hay voz. */
  duck: boolean;
  keyframes?: Keyframes;
  enhance?: boolean;
}

export type AnimId =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'pop'
  | 'blur'
  | 'zoom'
  | 'wipe';

export interface TemplateClip extends ClipBase {
  type: 'template';
  template: string; // id del registro de plantillas
  props: Record<string, any>;
  transform: Transform;
  animIn: AnimId;
  animOut: AnimId;
  inDuration: number;
  outDuration: number;
  keyframes?: Keyframes;
}

export interface EffectClip extends ClipBase {
  type: 'effect';
  effect: string; // id del registro de efectos
  props: Record<string, any>;
}

export type Clip = MediaClip | AudioClip | TemplateClip | EffectClip;

export interface Word {
  start: number;
  end: number;
  text: string;
}

export interface CaptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  words: Word[]; // en tiempo de la línea de tiempo
}

export type CaptionPreset = 'pop' | 'karaoke' | 'clean' | 'glass' | 'minimal';

export interface CaptionStyle {
  preset: CaptionPreset;
  font: string;
  size: number; // px relativos a un lienzo de 1080 de ancho
  color: string;
  highlight: string;
  y: number; // 0 arriba .. 1 abajo (centro del bloque)
  uppercase: boolean;
  maxWords: number;
}

export interface Captions {
  enabled: boolean;
  style: CaptionStyle;
  segments: CaptionSegment[];
}

export interface Marker {
  id: string;
  time: number;
  label: string;
  color?: string;
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  fps: number;
  format: FormatId;
  background: string;
  assets: Asset[];
  tracks: Track[];
  clips: Clip[];
  captions: Captions;
  audio: { duckLevel: number; master: number };
  markers: Marker[];
  updatedAt: number;
}

export interface TranscriptFile {
  language?: string;
  words: Word[]; // tiempo de la fuente
}
