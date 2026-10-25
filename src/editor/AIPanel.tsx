import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, RotateCcw, Send, Terminal } from 'lucide-react';
import { api, type AiTurn } from '../api';
import { useEditor } from '../store';

interface Msg {
  role: 'user' | 'ai';
  text: string;
  actions?: AiTurn['actions'];
  error?: boolean;
}

const SUGGESTIONS = [
  'Quita los silencios y pausas del vídeo principal',
  'Genera subtítulos estilo pop',
  'Añade punch-ins sutiles en las frases clave',
  'Pon un rótulo de vidrio con la idea principal al inicio',
  'Haz la versión 16:9 para YouTube con buen encuadre',
];

const TOOL_LABEL: Record<string, string> = {
  get_project: 'Leer proyecto',
  get_transcript: 'Leer transcripción',
  transcribe: 'Transcribir',
  import_media: 'Importar',
  add_media_clip: 'Añadir clip',
  add_template: 'Añadir plantilla',
  add_effect: 'Añadir efecto',
  update_clip: 'Editar clip',
  delete_clips: 'Borrar clips',
  split: 'Cortar',
  cut_range: 'Quitar tramo',
  remove_silences: 'Quitar silencios',
  generate_captions: 'Subtítulos',
  set_format: 'Formato',
  apply_patch: 'Editar JSON',
};

export function AIPanel() {
  const project = useEditor((s) => s.project)!;
  const status = useEditor((s) => s.status);
  const key = `studio.chat.${project.id}`;
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]');
    } catch {
      return [];
    }
  });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(msgs.slice(-60)));
    } catch {
      /* almacenamiento no disponible */
    }
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, key]);

  const send = async (message: string) => {
    if (!message.trim() || busy) return;
    const st = useEditor.getState();
    const ctx = `cabezal en ${st.time.toFixed(2)} s; formato ${project.format}; seleccionados: ${st.selection.join(', ') || 'ninguno'}`;
    setMsgs((m) => [...m, { role: 'user', text: message }]);
    setText('');
    setBusy(true);
    try {
      const res = await api.ai(project.id, message, ctx);
      setMsgs((m) => [...m, { role: 'ai', text: res.reply, actions: res.actions }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'ai', text: String(e.message), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setMsgs([]);
    await api.aiReset(project.id).catch(() => {});
  };

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef}>
        {!status?.ai && (
          <div className="panel-card" style={{ lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Terminal size={14} /> Fase 1 · Claude Code
            </div>
            <div className="hint" style={{ fontSize: 12.5 }}>
              Pídeme cambios en tu sesión de Claude Code (por ejemplo: «pon un rótulo de vidrio en el segundo 3»). Edito el proyecto y lo verás aquí al instante.
            </div>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, margin: '12px 0 6px' }}>
              <Bot size={14} /> Fase 2 · Chat integrado
            </div>
            <div className="hint" style={{ fontSize: 12.5 }}>
              Añade <code>ANTHROPIC_API_KEY</code> al fichero <code>.env</code> y reinicia <code>npm run dev</code> para chatear desde aquí.
            </div>
          </div>
        )}
        {msgs.length === 0 && status?.ai && (
          <div className="empty">
            <Bot size={22} style={{ marginBottom: 8 }} />
            <div>Dime qué quieres hacer con el vídeo. Puedo cortar, añadir gráficos, subtítulos, efectos y adaptar formatos.</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`} style={m.error ? { borderColor: 'rgba(255,93,93,.5)' } : undefined}>
            {m.text}
            {m.actions && m.actions.length > 0 && (
              <div className="actions">
                {m.actions.filter((a) => !a.tool.startsWith('get_')).map((a, j) => (
                  <span key={j} className={`pill ${a.ok ? 'ok' : 'err'}`} title={a.result}>
                    {TOOL_LABEL[a.tool] ?? a.tool}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg ai" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
            <Loader2 size={14} className="spin" /> Editando…
          </div>
        )}
      </div>
      <div className="chat-input">
        {msgs.length === 0 && status?.ai && (
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <textarea
          placeholder={status?.ai ? 'Pide un cambio… (⌘↵ para enviar)' : 'Configura la API key para usar el chat integrado'}
          value={text}
          disabled={!status?.ai}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || !e.shiftKey)) {
              e.preventDefault();
              send(text);
            }
          }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn sm ghost" onClick={reset} title="Nueva conversación">
            <RotateCcw size={12} /> Nueva
          </button>
          <div className="spacer" />
          <button className="btn sm primary" disabled={!status?.ai || busy || !text.trim()} onClick={() => send(text)}>
            <Send size={12} /> Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
