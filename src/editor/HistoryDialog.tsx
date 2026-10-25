import { useEffect, useState } from 'react';
import { Bot, Clock, History, RotateCcw, X } from 'lucide-react';
import { api } from '../api';
import { useEditor } from '../store';
import { formatSec } from './util';

type Version = Awaited<ReturnType<typeof api.history>>[number];

const REASON: Record<string, string> = { auto: 'Guardado automático', ia: 'Antes de un cambio de la IA', restaurar: 'Antes de restaurar' };

export function HistoryDialog() {
  const project = useEditor((s) => s.project)!;
  const st = useEditor.getState();
  const [list, setList] = useState<Version[] | null>(null);
  useEffect(() => {
    api.history(project.id).then(setList).catch((e) => st.notify(String(e.message), 'error'));
  }, [project.id]);

  const restore = async (v: Version) => {
    await api.restore(project.id, v.file);
    st.notify('Versión restaurada (puedes deshacer con ⌘Z)');
    st.set({ historyOpen: false });
  };

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && st.set({ historyOpen: false })}>
      <div className="modal">
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2>Historial de versiones</h2>
            <div className="sub">Copias automáticas cada pocos minutos y antes de cada cambio de la IA. Se guardan en la carpeta del proyecto.</div>
          </div>
          <button className="icon-btn" onClick={() => st.set({ historyOpen: false })}>
            <X size={16} />
          </button>
        </div>
        {list === null && <div className="empty">Cargando…</div>}
        {list?.length === 0 && <div className="empty">Aún no hay versiones guardadas. Se crean solas mientras editas.</div>}
        {list?.map((v) => (
          <div key={v.file} className="job" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {v.reason === 'ia' ? <Bot size={15} color="var(--accent)" /> : v.reason === 'restaurar' ? <History size={15} /> : <Clock size={15} color="var(--faint)" />}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>
                {new Date(v.time).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <div className="hint">
                {REASON[v.reason] ?? v.reason} · {v.clips} clips · {formatSec(v.duration)}
              </div>
            </div>
            <button className="btn sm" onClick={() => restore(v)}>
              <RotateCcw size={12} /> Restaurar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
