// Catálogo de plantillas, efectos y transiciones. Lo usan el inspector (para
// generar los controles), la galería y la IA (para saber qué puede crear).

import type { AnimId, CaptionPreset, TransitionId } from './types';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'color'
  | 'select'
  | 'boolean'
  | 'asset'
  | 'icon'
  | 'font'
  | 'panels';

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  default: any;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  /** Para 'panels': número de paneles y subcampos. */
  panelFields?: Field[];
  panelCount?: number;
  assetTypes?: ('video' | 'image')[];
}

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  category: 'rótulos' | 'layouts' | 'títulos' | 'texto' | 'elementos';
  defaultDuration: number;
  animIn: AnimId;
  animOut: AnimId;
  fields: Field[];
}

export const ICONS = [
  'lock',
  'sparkles',
  'zap',
  'star',
  'play',
  'check',
  'flame',
  'rocket',
  'bell',
  'heart',
  'brain',
  'bot',
  'camera',
  'trophy',
  'lightbulb',
  'none',
] as const;

export const FONTS = [
  { value: 'Inter Variable', label: 'Inter' },
  { value: 'Space Grotesk Variable', label: 'Space Grotesk' },
  { value: 'Bebas Neue', label: 'Bebas Neue' },
  { value: 'Playfair Display Variable', label: 'Playfair Display' },
  { value: 'JetBrains Mono Variable', label: 'JetBrains Mono' },
];

const POSITIONS = [
  { value: 'bottom-left', label: 'Abajo izquierda' },
  { value: 'bottom-right', label: 'Abajo derecha' },
  { value: 'bottom-center', label: 'Abajo centro' },
  { value: 'top-left', label: 'Arriba izquierda' },
  { value: 'top-right', label: 'Arriba derecha' },
  { value: 'top-center', label: 'Arriba centro' },
  { value: 'center', label: 'Centro' },
];

const panel = (extra: Field[]): Field[] => [
  { key: 'assetId', label: 'Medio', type: 'asset', default: '', assetTypes: ['video', 'image'] },
  { key: 'in', label: 'Inicio en la fuente (s)', type: 'number', default: 0, min: 0, step: 0.1 },
  ...extra,
];

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'glass-lower-third',
    name: 'Rótulo de vidrio',
    description: 'Tarjeta translúcida con desenfoque y borde cromado, con icono, título y subtítulo.',
    category: 'rótulos',
    defaultDuration: 4,
    animIn: 'slide-up',
    animOut: 'blur',
    fields: [
      { key: 'icon', label: 'Icono', type: 'icon', default: 'lock' },
      { key: 'title', label: 'Título', type: 'text', default: 'AI skill' },
      { key: 'subtitle', label: 'Subtítulo', type: 'text', default: 'At the end' },
      { key: 'position', label: 'Posición', type: 'select', default: 'bottom-left', options: POSITIONS },
      { key: 'size', label: 'Tamaño', type: 'number', default: 1, min: 0.5, max: 2.5, step: 0.05 },
      { key: 'tint', label: 'Tinte', type: 'color', default: '#ffffff' },
      { key: 'blur', label: 'Desenfoque', type: 'number', default: 22, min: 0, max: 60, step: 1 },
      { key: 'chrome', label: 'Borde cromado', type: 'boolean', default: true },
    ],
  },
  {
    id: 'split-screen',
    name: 'Pantalla dividida',
    description: 'Dos paneles con marco cromado y título grande sobre un fondo desvanecido.',
    category: 'layouts',
    defaultDuration: 5,
    animIn: 'none',
    animOut: 'fade',
    fields: [
      {
        key: 'panels',
        label: 'Paneles',
        type: 'panels',
        panelCount: 2,
        default: [
          { assetId: '', in: 0, label: 'SCENE 2' },
          { assetId: '', in: 0, label: 'SCENE 3' },
        ],
        panelFields: panel([{ key: 'label', label: 'Título', type: 'text', default: 'SCENE' }]),
      },
      { key: 'background', label: 'Fondo', type: 'asset', default: '', assetTypes: ['video', 'image'] },
      { key: 'bgColor', label: 'Color de fondo', type: 'color', default: '#f4f5f7' },
      { key: 'bgFade', label: 'Velado del fondo', type: 'number', default: 0.55, min: 0, max: 1, step: 0.05 },
      { key: 'labelColor', label: 'Color de títulos', type: 'color', default: '#1b1d22' },
      { key: 'frame', label: 'Marco', type: 'select', default: 'chrome', options: [
        { value: 'chrome', label: 'Cromado' },
        { value: 'white', label: 'Blanco' },
        { value: 'none', label: 'Sin marco' },
      ] },
      { key: 'layout', label: 'Disposición', type: 'select', default: 'auto', options: [
        { value: 'auto', label: 'Automática' },
        { value: 'horizontal', label: 'Lado a lado' },
        { value: 'vertical', label: 'Arriba y abajo' },
      ] },
      { key: 'grid', label: 'Líneas guía', type: 'boolean', default: true },
    ],
  },
  {
    id: 'triptych',
    name: 'Tríptico',
    description: 'Tres paneles con etiquetas y una barra de título de cromo líquido opcional.',
    category: 'layouts',
    defaultDuration: 5,
    animIn: 'none',
    animOut: 'fade',
    fields: [
      {
        key: 'panels',
        label: 'Paneles',
        type: 'panels',
        panelCount: 3,
        default: [
          { assetId: '', in: 0, badge: '480P', dot: false },
          { assetId: '', in: 0, badge: '480P', dot: false },
          { assetId: '', in: 0, badge: '480P', dot: true },
        ],
        panelFields: panel([
          { key: 'badge', label: 'Etiqueta', type: 'text', default: '480P' },
          { key: 'dot', label: 'Punto destacado', type: 'boolean', default: false },
        ]),
      },
      { key: 'title', label: 'Título (barra cromada)', type: 'text', default: 'Rank' },
      { key: 'dotColor', label: 'Color del punto', type: 'color', default: '#f5b400' },
      { key: 'layout', label: 'Disposición', type: 'select', default: 'auto', options: [
        { value: 'auto', label: 'Automática' },
        { value: 'columns', label: 'Columnas' },
        { value: 'rows', label: 'Filas' },
      ] },
    ],
  },
  {
    id: 'paper',
    name: 'Paper (collage)',
    description:
      'Hoja de un paper que cae sobre papel texturizado, con acercamiento al título y marcas a mano (rotulador, subrayado o círculo) en las frases entre *asteriscos*.',
    category: 'layouts',
    defaultDuration: 6,
    animIn: 'none',
    animOut: 'blur',
    fields: [
      { key: 'source', label: 'Fuente / revista', type: 'text', default: 'arXiv · 2026' },
      { key: 'title', label: 'Título (*frase* = marcada)', type: 'textarea', default: 'Small models can *reason* like *large ones*' },
      { key: 'authors', label: 'Autores', type: 'textarea', default: 'A. Pérez · L. Chen · M. Rossi\nStanford University · Google DeepMind' },
      {
        key: 'abstract',
        label: 'Resumen (*frase* = marcada)',
        type: 'textarea',
        default:
          'We show that a 3B-parameter model trained on synthetic reasoning traces *matches models 20x its size* on math and coding benchmarks, while running on a single laptop GPU.',
      },
      { key: 'note', label: 'Nota adhesiva', type: 'text', default: 'Nuevo paper' },
      { key: 'image', label: 'Recorte (figura o foto)', type: 'asset', default: '', assetTypes: ['image', 'video'] },
      { key: 'bw', label: 'Recorte en blanco y negro', type: 'boolean', default: true },
      { key: 'mark', label: 'Marca', type: 'select', default: 'marker', options: [
        { value: 'marker', label: 'Rotulador' },
        { value: 'underline', label: 'Subrayado a mano' },
        { value: 'circle', label: 'Círculo a mano' },
      ] },
      { key: 'accent', label: 'Color de las marcas', type: 'color', default: '#f5a524' },
      { key: 'font', label: 'Fuente del título', type: 'font', default: 'Playfair Display Variable' },
      { key: 'background', label: 'Fondo', type: 'select', default: 'paper', options: [
        { value: 'paper', label: 'Papel texturizado' },
        { value: 'dim', label: 'Oscurecer' },
        { value: 'none', label: 'Ninguno' },
      ] },
      { key: 'zoom', label: 'Acercamiento', type: 'number', default: 1.45, min: 1, max: 2, step: 0.05 },
      { key: 'tilt', label: 'Inclinación (°)', type: 'number', default: -2.5, min: -15, max: 15, step: 0.5 },
      { key: 'halftone', label: 'Tramas de puntos', type: 'boolean', default: true },
      { key: 'stopMotion', label: 'Stop motion (12 fps)', type: 'boolean', default: true },
    ],
  },
  {
    id: 'liquid-title',
    name: 'Título cromo líquido',
    description: 'Barra o texto de metal líquido animado con shader, como el título "Rank".',
    category: 'títulos',
    defaultDuration: 3.5,
    animIn: 'wipe',
    animOut: 'blur',
    fields: [
      { key: 'text', label: 'Texto', type: 'text', default: 'Rank' },
      { key: 'mode', label: 'Estilo', type: 'select', default: 'bar', options: [
        { value: 'bar', label: 'Barra cromada con texto' },
        { value: 'text', label: 'Texto de cromo' },
      ] },
      { key: 'position', label: 'Posición', type: 'select', default: 'top-center', options: POSITIONS },
      { key: 'size', label: 'Tamaño', type: 'number', default: 1, min: 0.4, max: 3, step: 0.05 },
      { key: 'tint', label: 'Tinte del metal', type: 'color', default: '#c9ced6' },
      { key: 'speed', label: 'Velocidad del líquido', type: 'number', default: 1, min: 0, max: 4, step: 0.1 },
    ],
  },
  {
    id: 'title-card',
    name: 'Título grande',
    description: 'Titular grande con aparición palabra a palabra y fondo opcional.',
    category: 'títulos',
    defaultDuration: 3,
    animIn: 'none',
    animOut: 'fade',
    fields: [
      { key: 'text', label: 'Titular', type: 'textarea', default: 'Tu titular aquí' },
      { key: 'subtitle', label: 'Subtítulo', type: 'text', default: '' },
      { key: 'font', label: 'Fuente', type: 'font', default: 'Inter Variable' },
      { key: 'size', label: 'Tamaño', type: 'number', default: 120, min: 30, max: 300, step: 2 },
      { key: 'color', label: 'Color', type: 'color', default: '#ffffff' },
      { key: 'accent', label: 'Color de acento', type: 'color', default: '#d9f99d' },
      { key: 'background', label: 'Fondo', type: 'select', default: 'dim', options: [
        { value: 'none', label: 'Ninguno' },
        { value: 'dim', label: 'Oscurecer' },
        { value: 'blur', label: 'Desenfocar' },
        { value: 'black', label: 'Negro' },
        { value: 'white', label: 'Blanco' },
      ] },
      { key: 'align', label: 'Alineación', type: 'select', default: 'center', options: [
        { value: 'left', label: 'Izquierda' },
        { value: 'center', label: 'Centro' },
      ] },
    ],
  },
  {
    id: 'text',
    name: 'Texto',
    description: 'Texto libre con estilo configurable y animación de entrada/salida.',
    category: 'texto',
    defaultDuration: 3,
    animIn: 'pop',
    animOut: 'fade',
    fields: [
      { key: 'text', label: 'Texto', type: 'textarea', default: 'Texto' },
      { key: 'font', label: 'Fuente', type: 'font', default: 'Inter Variable' },
      { key: 'size', label: 'Tamaño', type: 'number', default: 80, min: 12, max: 400, step: 1 },
      { key: 'weight', label: 'Grosor', type: 'number', default: 800, min: 100, max: 900, step: 100 },
      { key: 'color', label: 'Color', type: 'color', default: '#ffffff' },
      { key: 'box', label: 'Caja de fondo', type: 'boolean', default: false },
      { key: 'boxColor', label: 'Color de la caja', type: 'color', default: '#000000' },
      { key: 'shadow', label: 'Sombra', type: 'boolean', default: true },
      { key: 'uppercase', label: 'Mayúsculas', type: 'boolean', default: false },
      { key: 'align', label: 'Alineación', type: 'select', default: 'center', options: [
        { value: 'left', label: 'Izquierda' },
        { value: 'center', label: 'Centro' },
        { value: 'right', label: 'Derecha' },
      ] },
      { key: 'position', label: 'Posición', type: 'select', default: 'center', options: POSITIONS },
    ],
  },
  {
    id: 'badge',
    name: 'Etiqueta',
    description: 'Etiqueta pequeña tipo "480P" con punto de color opcional.',
    category: 'elementos',
    defaultDuration: 3,
    animIn: 'pop',
    animOut: 'fade',
    fields: [
      { key: 'text', label: 'Texto', type: 'text', default: '480P' },
      { key: 'style', label: 'Estilo', type: 'select', default: 'white', options: [
        { value: 'white', label: 'Blanco' },
        { value: 'dark', label: 'Oscuro' },
        { value: 'glass', label: 'Vidrio' },
      ] },
      { key: 'dot', label: 'Punto', type: 'boolean', default: false },
      { key: 'dotColor', label: 'Color del punto', type: 'color', default: '#f5b400' },
      { key: 'position', label: 'Posición', type: 'select', default: 'bottom-right', options: POSITIONS },
      { key: 'size', label: 'Tamaño', type: 'number', default: 1, min: 0.5, max: 3, step: 0.05 },
    ],
  },
  {
    id: 'subscribe',
    name: 'Botón suscribirse',
    description: 'Píldora de vidrio con icono y un clic animado, para llamadas a la acción.',
    category: 'elementos',
    defaultDuration: 3.5,
    animIn: 'pop',
    animOut: 'fade',
    fields: [
      { key: 'text', label: 'Texto', type: 'text', default: 'Suscríbete' },
      { key: 'done', label: 'Texto tras el clic', type: 'text', default: 'Suscrito' },
      { key: 'icon', label: 'Icono', type: 'icon', default: 'bell' },
      { key: 'accent', label: 'Color', type: 'color', default: '#ff3b30' },
      { key: 'position', label: 'Posición', type: 'select', default: 'bottom-center', options: POSITIONS },
      { key: 'size', label: 'Tamaño', type: 'number', default: 1, min: 0.5, max: 2.5, step: 0.05 },
    ],
  },
  {
    id: 'progress',
    name: 'Barra de progreso',
    description: 'Barra fina que avanza durante el clip; útil en Reels.',
    category: 'elementos',
    defaultDuration: 10,
    animIn: 'fade',
    animOut: 'fade',
    fields: [
      { key: 'color', label: 'Color', type: 'color', default: '#d9f99d' },
      { key: 'height', label: 'Grosor', type: 'number', default: 8, min: 2, max: 40, step: 1 },
      { key: 'edge', label: 'Borde', type: 'select', default: 'top', options: [
        { value: 'top', label: 'Arriba' },
        { value: 'bottom', label: 'Abajo' },
      ] },
    ],
  },
];

export interface EffectDef {
  id: string;
  name: string;
  description: string;
  defaultDuration: number;
  fields: Field[];
}

export const EFFECTS: EffectDef[] = [
  {
    id: 'zoom',
    name: 'Punch-in (zoom)',
    description: 'Acerca la cámara a un punto con entrada y salida suaves. Afecta a las pistas inferiores.',
    defaultDuration: 2.5,
    fields: [
      { key: 'scale', label: 'Zoom', type: 'number', default: 1.25, min: 1, max: 3, step: 0.01 },
      { key: 'x', label: 'Foco X', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 },
      { key: 'y', label: 'Foco Y', type: 'number', default: 0.38, min: 0, max: 1, step: 0.01 },
      { key: 'ease', label: 'Rampa (s)', type: 'number', default: 0.35, min: 0, max: 3, step: 0.05 },
      { key: 'snap', label: 'Corte seco (sin rampa)', type: 'boolean', default: false },
    ],
  },
  {
    id: 'shake',
    name: 'Temblor',
    description: 'Sacudida de cámara para enfatizar un momento.',
    defaultDuration: 0.6,
    fields: [{ key: 'intensity', label: 'Intensidad', type: 'number', default: 1, min: 0.1, max: 4, step: 0.1 }],
  },
  {
    id: 'flash',
    name: 'Destello',
    description: 'Flash de color que aparece y se desvanece.',
    defaultDuration: 0.4,
    fields: [{ key: 'color', label: 'Color', type: 'color', default: '#ffffff' }],
  },
  {
    id: 'blur',
    name: 'Desenfoque',
    description: 'Desenfoca lo que hay debajo (ideal para destacar texto encima).',
    defaultDuration: 2,
    fields: [
      { key: 'amount', label: 'Cantidad', type: 'number', default: 18, min: 0, max: 80, step: 1 },
      { key: 'dim', label: 'Oscurecer', type: 'number', default: 0.25, min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'grade',
    name: 'Corrección de color',
    description: 'Brillo, contraste, saturación y temperatura sobre las pistas inferiores.',
    defaultDuration: 5,
    fields: [
      { key: 'brightness', label: 'Brillo', type: 'number', default: 1.05, min: 0.3, max: 2, step: 0.01 },
      { key: 'contrast', label: 'Contraste', type: 'number', default: 1.08, min: 0.3, max: 2, step: 0.01 },
      { key: 'saturation', label: 'Saturación', type: 'number', default: 1.1, min: 0, max: 3, step: 0.01 },
      { key: 'warmth', label: 'Calidez', type: 'number', default: 0.1, min: -1, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'vignette',
    name: 'Viñeta',
    description: 'Oscurece los bordes para centrar la atención.',
    defaultDuration: 5,
    fields: [{ key: 'amount', label: 'Intensidad', type: 'number', default: 0.55, min: 0, max: 1, step: 0.05 }],
  },
];

export const TRANSITIONS: { id: TransitionId; name: string }[] = [
  { id: 'fade', name: 'Fundido cruzado' },
  { id: 'dip-black', name: 'Fundido a negro' },
  { id: 'dip-white', name: 'Fundido a blanco' },
  { id: 'zoom', name: 'Zoom' },
  { id: 'slide-left', name: 'Deslizar' },
  { id: 'slide-up', name: 'Deslizar arriba' },
  { id: 'blur', name: 'Desenfoque' },
  { id: 'whip', name: 'Barrido rápido' },
];

export const ANIMS: { id: AnimId; name: string }[] = [
  { id: 'none', name: 'Ninguna' },
  { id: 'fade', name: 'Fundido' },
  { id: 'slide-up', name: 'Subir' },
  { id: 'slide-down', name: 'Bajar' },
  { id: 'slide-left', name: 'Desde la derecha' },
  { id: 'slide-right', name: 'Desde la izquierda' },
  { id: 'pop', name: 'Pop' },
  { id: 'blur', name: 'Desenfoque' },
  { id: 'zoom', name: 'Zoom' },
  { id: 'wipe', name: 'Barrido' },
];

export const CAPTION_PRESETS: { id: CaptionPreset; name: string; description: string }[] = [
  { id: 'pop', name: 'Pop', description: 'Grandes, en negrita, palabra activa resaltada (estilo Reels).' },
  { id: 'karaoke', name: 'Karaoke', description: 'La frase entera y las palabras se iluminan al decirse.' },
  { id: 'glass', name: 'Vidrio', description: 'Píldora de vidrio esmerilado a juego con los rótulos.' },
  { id: 'clean', name: 'Limpio', description: 'Caja oscura translúcida, estilo documental.' },
  { id: 'minimal', name: 'Minimal', description: 'Texto blanco pequeño con sombra.' },
];

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getEffect(id: string): EffectDef | undefined {
  return EFFECTS.find((e) => e.id === id);
}

export function defaultsFor(fields: Field[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields) out[f.key] = structuredClone(f.default);
  return out;
}
