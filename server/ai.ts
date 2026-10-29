// Fase 2: chat con Claude dentro del editor. Claude recibe herramientas de
// edición de alto nivel y modifica project.json; la interfaz se actualiza sola.

import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import jsonpatch from 'fast-json-patch';
import type { FormatId, Project } from '../shared/types';
import { ANIMS, CAPTION_PRESETS, EFFECTS, TEMPLATES, TRANSITIONS } from '../shared/registry';
import {
  createEffectClip,
  createMediaClip,
  createTemplateClip,
  cutRange,
  deleteClips,
  generateCaptions,
  getClip,
  isMedia,
  normalizeProject,
  projectDuration,
  removeSourceRanges,
  setFormat,
  splitAt,
} from '../shared/ops';
import { silencesFromPeaks, silencesFromWords } from '../shared/silence';
import { FORMAT_IDS } from '../shared/formats';
import { AI_MODEL, ROOT } from './config';
import { loadProject, mediaDir, mediaPath, mutateProject } from './store';
import { readAllTranscripts, readTranscript, transcribeAsset } from './transcribe';
import { importFile, resolveImportPath } from './media';

type ToolInput = Record<string, any>;

const histories = new Map<string, Anthropic.Beta.BetaMessageParam[]>();

export function aiAvailable(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function resetChat(projectId: string) {
  histories.delete(projectId);
}

function catalog(): string {
  const fields = (fs: { key: string; type: string; default: any; options?: { value: string }[] }[]) =>
    fs
      .map((f) => `${f.key}:${f.type}${f.options ? `(${f.options.map((o) => o.value).join('|')})` : ''}=${JSON.stringify(f.default)}`)
      .join(', ');
  return [
    '## Plantillas (clip type "template", campo "template")',
    ...TEMPLATES.map((t) => `- ${t.id} — ${t.name}: ${t.description} Props: ${fields(t.fields)}`),
    '## Efectos (clip type "effect", afectan a las pistas inferiores)',
    ...EFFECTS.map((e) => `- ${e.id} — ${e.name}: ${e.description} Props: ${fields(e.fields)}`),
    `## Transiciones (transitionIn de clips de vídeo/imagen): ${TRANSITIONS.map((t) => t.id).join(', ')}`,
    `## Animaciones de entrada/salida de plantillas: ${ANIMS.map((a) => a.id).join(', ')}`,
    `## Estilos de subtítulos: ${CAPTION_PRESETS.map((c) => `${c.id} (${c.description})`).join('; ')}`,
    `## Formatos: ${FORMAT_IDS.join(', ')}`,
  ].join('\n');
}

function systemPrompt(): string {
  const formatDoc = fs.readFileSync(path.join(ROOT, 'docs', 'PROJECT_FORMAT.md'), 'utf8');
  return `Eres el asistente de edición de "Studio IA", el editor de vídeo personal de Luis. Editas su proyecto directamente con herramientas; los cambios aparecen al instante en su línea de tiempo.

Cómo trabajar:
- Responde siempre en español, breve y concreto. Tras editar, resume en 1-3 frases qué cambiaste y en qué segundos.
- Antes de editar, si no tienes el proyecto en contexto, llama a get_project. Para decidir dónde colocar gráficos o cortes según lo que se dice, usa get_transcript.
- Prefiere las herramientas de alto nivel (add_template, add_effect, update_clip, cut_range, remove_silences, generate_captions). Usa apply_patch solo para cambios que no cubran.
- Tiempos en segundos de la línea de tiempo salvo que se indique "tiempo de la fuente".
- Estilo visual de Luis: vidrio esmerilado, cromo líquido, tipografía grotesca en negrita, etiquetas blancas limpias, ritmo de Reels. Para talking head: punch-ins sutiles (1.12–1.3) en frases clave, rótulos de vidrio para conceptos, subtítulos "pop".
- No inventes ids: obténlos de get_project.

${formatDoc}

${catalog()}`;
}

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: 'get_project',
    description: 'Devuelve el proyecto actual (formato, medios, pistas, clips, subtítulos) y su duración.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_transcript',
    description: 'Transcripción palabra a palabra de un medio, en tiempo de la fuente, agrupada en frases con su tiempo de inicio.',
    input_schema: {
      type: 'object',
      properties: { assetId: { type: 'string' } },
      required: ['assetId'],
      additionalProperties: false,
    },
  },
  {
    name: 'transcribe',
    description: 'Transcribe un medio con Whisper local (tarda unos segundos). Necesario antes de generar subtítulos o cortar silencios por palabras.',
    input_schema: {
      type: 'object',
      properties: { assetId: { type: 'string' }, language: { type: 'string', description: 'código ISO, p.ej. es, en, o auto' } },
      required: ['assetId'],
      additionalProperties: false,
    },
  },
  {
    name: 'import_media',
    description: 'Importa un fichero del ordenador de Luis al proyecto por su ruta absoluta.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_media_clip',
    description: 'Coloca un medio (vídeo, imagen o audio) en la línea de tiempo.',
    input_schema: {
      type: 'object',
      properties: {
        assetId: { type: 'string' },
        start: { type: 'number' },
        trackId: { type: 'string' },
        in: { type: 'number', description: 'inicio en la fuente (s)' },
        duration: { type: 'number' },
      },
      required: ['assetId', 'start'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_template',
    description: 'Añade una plantilla de motion graphics (ver catálogo) en la línea de tiempo.',
    input_schema: {
      type: 'object',
      properties: {
        template: { type: 'string' },
        start: { type: 'number' },
        duration: { type: 'number' },
        props: { type: 'object' },
        trackId: { type: 'string' },
        animIn: { type: 'string' },
        animOut: { type: 'string' },
      },
      required: ['template', 'start'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_effect',
    description: 'Añade un efecto (zoom/punch-in, temblor, destello, desenfoque, color, viñeta) que afecta a las pistas inferiores.',
    input_schema: {
      type: 'object',
      properties: {
        effect: { type: 'string' },
        start: { type: 'number' },
        duration: { type: 'number' },
        props: { type: 'object' },
      },
      required: ['effect', 'start'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_clip',
    description: 'Modifica un clip. "changes" se fusiona en profundidad (p.ej. {"props":{"title":"Hola"}, "start": 3}).',
    input_schema: {
      type: 'object',
      properties: { clipId: { type: 'string' }, changes: { type: 'object' } },
      required: ['clipId', 'changes'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_clips',
    description: 'Elimina clips. Con ripple=true cierra el hueco.',
    input_schema: {
      type: 'object',
      properties: { clipIds: { type: 'array', items: { type: 'string' } }, ripple: { type: 'boolean' } },
      required: ['clipIds'],
      additionalProperties: false,
    },
  },
  {
    name: 'split',
    description: 'Corta en un instante todos los clips (o solo los indicados).',
    input_schema: {
      type: 'object',
      properties: { time: { type: 'number' }, clipIds: { type: 'array', items: { type: 'string' } } },
      required: ['time'],
      additionalProperties: false,
    },
  },
  {
    name: 'cut_range',
    description: 'Elimina un tramo [start, end] de la línea de tiempo y desplaza todo lo posterior (jump cut).',
    input_schema: {
      type: 'object',
      properties: { start: { type: 'number' }, end: { type: 'number' } },
      required: ['start', 'end'],
      additionalProperties: false,
    },
  },
  {
    name: 'remove_silences',
    description: 'Quita automáticamente los silencios y pausas de un clip de vídeo/audio (jump cuts). Usa la transcripción si existe.',
    input_schema: {
      type: 'object',
      properties: {
        clipId: { type: 'string' },
        minSilence: { type: 'number', description: 'pausa mínima a quitar, s (0.45 por defecto)' },
        pad: { type: 'number', description: 'margen que se conserva, s (0.1 por defecto)' },
      },
      required: ['clipId'],
      additionalProperties: false,
    },
  },
  {
    name: 'generate_captions',
    description: 'Genera subtítulos a partir de las transcripciones de los clips. Opcionalmente cambia el estilo.',
    input_schema: {
      type: 'object',
      properties: { style: { type: 'object', description: 'campos de CaptionStyle a cambiar' } },
      additionalProperties: false,
    },
  },
  {
    name: 'set_format',
    description: 'Cambia el formato del lienzo (16:9, 9:16, 1:1, 4:5).',
    input_schema: {
      type: 'object',
      properties: { format: { type: 'string', enum: FORMAT_IDS } },
      required: ['format'],
      additionalProperties: false,
    },
  },
  {
    name: 'apply_patch',
    description: 'Aplica operaciones JSON Patch (RFC 6902) al proyecto completo. Para casos no cubiertos por otras herramientas.',
    input_schema: {
      type: 'object',
      properties: { operations: { type: 'array', items: { type: 'object' } } },
      required: ['operations'],
      additionalProperties: false,
    },
  },
];

function compactProject(p: Project) {
  return {
    name: p.name,
    format: p.format,
    fps: p.fps,
    duration: Math.round(projectDuration(p) * 100) / 100,
    audio: p.audio,
    assets: p.assets.filter((a) => !a.removed).map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      duration: a.duration,
      width: a.width,
      height: a.height,
      hasAudio: a.hasAudio,
      status: a.status,
      transcript: a.transcriptStatus ?? 'none',
    })),
    tracks: p.tracks,
    clips: p.clips,
    captions: {
      enabled: p.captions.enabled,
      style: p.captions.style,
      segments: p.captions.segments.map((s) => ({ id: s.id, start: s.start, end: s.end, text: s.text })),
    },
    markers: p.markers,
  };
}

function deepMerge(target: any, src: any) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') deepMerge(target[k], v);
    else target[k] = v;
  }
}

function loadPeaks(projectId: string, waveform?: string): { rate: number; peaks: number[] } | null {
  if (!waveform) return null;
  const f = mediaPath(projectId, waveform);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

async function runTool(projectId: string, name: string, input: ToolInput): Promise<string> {
  const edit = (fn: (p: Project) => any) => {
    let result: any;
    mutateProject(projectId, (p) => {
      result = fn(p);
      normalizeProject(p);
    });
    return result;
  };

  switch (name) {
    case 'get_project':
      return JSON.stringify(compactProject(loadProject(projectId)));
    case 'get_transcript': {
      const t = readTranscript(projectId, input.assetId);
      if (!t) return 'Este medio no tiene transcripción. Usa la herramienta transcribe.';
      const lines: string[] = [];
      let cur: string[] = [];
      let start = 0;
      t.words.forEach((w, i) => {
        if (!cur.length) start = w.start;
        cur.push(w.text);
        const next = t.words[i + 1];
        if (!next || /[.!?]$/.test(w.text) || next.start - w.end > 0.6 || cur.length >= 14) {
          lines.push(`[${start.toFixed(2)}–${w.end.toFixed(2)}] ${cur.join(' ')}`);
          cur = [];
        }
      });
      return `Idioma: ${t.language ?? '?'}\n${lines.join('\n')}`;
    }
    case 'transcribe':
      await transcribeAsset(projectId, input.assetId, input.language ?? 'auto');
      return 'Transcripción lista.';
    case 'import_media': {
      const src = resolveImportPath(String(input.path));
      const a = await importFile(projectId, src, path.basename(src));
      return `Importado como ${a.id} (${a.type}, ${a.duration.toFixed(1)} s). Se está procesando.`;
    }
    case 'add_media_clip':
      return edit((p) => {
        const asset = p.assets.find((a) => a.id === input.assetId);
        if (!asset) throw new Error('assetId no encontrado');
        const c = createMediaClip(p, asset, input.start, input.trackId);
        if (input.in !== undefined && isMedia(c)) c.in = input.in;
        if (input.duration) c.duration = input.duration;
        return `Clip ${c.id} en pista ${c.trackId} (${c.start}–${(c.start + c.duration).toFixed(2)} s).`;
      });
    case 'add_template':
      return edit((p) => {
        const c = createTemplateClip(p, input.template, input.start, input.props ?? {}, input.trackId, input.duration);
        if (input.animIn) c.animIn = input.animIn;
        if (input.animOut) c.animOut = input.animOut;
        return `Plantilla ${c.id} en pista ${c.trackId}.`;
      });
    case 'add_effect':
      return edit((p) => {
        const c = createEffectClip(p, input.effect, input.start, input.props ?? {}, undefined, input.duration);
        return `Efecto ${c.id} en pista ${c.trackId}.`;
      });
    case 'update_clip':
      return edit((p) => {
        const c = getClip(p, input.clipId);
        if (!c) throw new Error('clipId no encontrado');
        deepMerge(c, input.changes ?? {});
        return 'Clip actualizado.';
      });
    case 'delete_clips':
      return edit((p) => {
        deleteClips(p, input.clipIds, !!input.ripple);
        return `Eliminados ${input.clipIds.length} clips.`;
      });
    case 'split':
      return edit((p) => `Creados ${splitAt(p, input.time, input.clipIds).length} cortes.`);
    case 'cut_range':
      return edit((p) => {
        cutRange(p, input.start, input.end);
        return `Tramo eliminado. Nueva duración ${projectDuration(p).toFixed(2)} s.`;
      });
    case 'remove_silences': {
      const p0 = loadProject(projectId);
      const c = getClip(p0, input.clipId);
      if (!c || !isMedia(c)) throw new Error('clipId no válido');
      const asset = p0.assets.find((a) => a.id === c.assetId)!;
      const opts = { minSilence: input.minSilence ?? 0.3, pad: input.pad ?? 0.08, sensitivity: 0.5 };
      const w = loadPeaks(projectId, asset.waveform);
      let ranges: [number, number][];
      if (w) ranges = silencesFromPeaks(w.peaks, w.rate, opts);
      else {
        const t = readTranscript(projectId, asset.id);
        if (!t?.words.length) throw new Error('No hay forma de onda ni transcripción para este medio');
        ranges = silencesFromWords(t.words, asset.duration, opts);
      }
      const removed = edit((p) => removeSourceRanges(p, c.id, ranges));
      return `Eliminados ${removed.toFixed(2)} s de silencios en ${ranges.length} tramos.`;
    }
    case 'generate_captions': {
      const transcripts = readAllTranscripts(projectId);
      if (!Object.keys(transcripts).length) return 'No hay transcripciones. Usa transcribe primero.';
      return edit((p) => {
        if (input.style) Object.assign(p.captions.style, input.style);
        return `Generadas ${generateCaptions(p, transcripts)} frases de subtítulos.`;
      });
    }
    case 'set_format':
      return edit((p) => {
        setFormat(p, input.format as FormatId);
        return `Formato ${input.format}.`;
      });
    case 'apply_patch':
      return edit((p) => {
        // Los medios (rutas de ficheros, copias, tipos) solo los gestiona el servidor
        const ops = (input.operations ?? []) as { path?: string; from?: string }[];
        if (ops.some((o) => /^\/(assets|id)(\/|$)/.test(String(o.path ?? '')) || /^\/(assets|id)(\/|$)/.test(String(o.from ?? ''))))
          throw new Error('apply_patch no puede modificar los medios (assets) ni el id del proyecto');
        jsonpatch.applyPatch(p, input.operations, true, true);
        return 'Parche aplicado.';
      });
    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}

export interface ChatTurn {
  reply: string;
  actions: { tool: string; input: ToolInput; ok: boolean; result: string }[];
}

let client: Anthropic | null = null;

export async function chat(projectId: string, userText: string, context?: string): Promise<ChatTurn> {
  client ??= new Anthropic();
  const history = histories.get(projectId) ?? [];
  histories.set(projectId, history);
  history.push({ role: 'user', content: context ? `${userText}\n\n[Contexto del editor: ${context}]` : userText });

  const actions: ChatTurn['actions'] = [];
  const texts: string[] = [];
  for (let step = 0; step < 25; step++) {
    const params: any = {
      model: AI_MODEL,
      max_tokens: 16000,
      system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      tools,
      messages: history,
    };
    const res = await client.beta.messages.create(params);
    history.push({ role: 'assistant', content: res.content as any });
    for (const b of res.content) if (b.type === 'text' && b.text.trim()) texts.push(b.text.trim());

    if (res.stop_reason === 'refusal') {
      texts.push('(La IA no ha podido completar esta petición.)');
      break;
    }
    if (res.stop_reason === 'pause_turn') continue;
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || !uses.length) break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      const input = (u.input ?? {}) as ToolInput;
      try {
        const out = await runTool(projectId, u.name, input);
        actions.push({ tool: u.name, input, ok: true, result: out.slice(0, 300) });
        results.push({ type: 'tool_result', tool_use_id: u.id, content: out });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        actions.push({ tool: u.name, input, ok: false, result: msg });
        results.push({ type: 'tool_result', tool_use_id: u.id, content: msg, is_error: true });
      }
    }
    history.push({ role: 'user', content: results });
  }
  return { reply: texts.join('\n\n') || 'Hecho.', actions };
}
