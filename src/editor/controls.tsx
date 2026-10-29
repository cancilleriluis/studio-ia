import { useRef } from 'react';
import type { Project } from '../../shared/types';
import { FONTS, ICONS, type Field } from '../../shared/registry';
import { ICON_MAP } from '../templates/common';
import { useEditor } from '../store';

/** Enlaza controles con el historial: los arrastres en vivo cuentan como un solo paso de deshacer. */
export function useBinder() {
  const live = useRef(false);
  return {
    begin() {
      if (live.current) return;
      useEditor.getState().beginTransient();
      live.current = true;
    },
    change(fn: (p: Project) => void) {
      const st = useEditor.getState();
      if (live.current) st.transient(fn);
      else st.commit(fn);
    },
    end() {
      if (!live.current) return;
      live.current = false;
      useEditor.getState().endTransient();
    },
  };
}
export type Binder = ReturnType<typeof useBinder>;

interface Live {
  onBegin?: () => void;
  onEnd?: () => void;
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 0.01,
  onBegin,
  onEnd,
}: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number } & Live) {
  const v = Number.isFinite(value) ? value : 0;
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return (
    <div className="num-row">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, v))}
        onPointerDown={onBegin}
        onPointerUp={onEnd}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        type="number"
        step={step}
        value={Number(v.toFixed(decimals))}
        onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function ColorInput({ value, onChange, onBegin, onEnd }: { value: string; onChange: (v: string) => void } & Live) {
  return (
    <div className="color-row">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onFocus={onBegin} onBlur={onEnd} onChange={(e) => onChange(e.target.value)} />
      <input
        type="text"
        defaultValue={value}
        key={value}
        onBlur={(e) => /^#[0-9a-f]{3,8}$/i.test(e.target.value) && e.target.value !== value && onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} />;
}

export function TextInput({ value, onChange, multiline }: { value: string; onChange: (v: string) => void; multiline?: boolean }) {
  const common = {
    defaultValue: value ?? '',
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => e.target.value !== value && onChange(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (!multiline || e.metaKey)) (e.target as HTMLElement).blur();
    },
  };
  return multiline ? <textarea key={value} rows={3} {...common} /> : <input key={value} type="text" {...common} />;
}

export function AssetPicker({ value, onChange, types }: { value: string; onChange: (v: string) => void; types?: string[] }) {
  const assets = useEditor((s) => s.project!.assets).filter((a) => (!a.removed || a.id === value) && (!types || types.includes(a.type)));
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Ninguno —</option>
      {assets.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

export function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="icon-grid">
      {ICONS.map((id) => {
        const I = ICON_MAP[id];
        return (
          <button key={id} className={value === id ? 'on' : ''} title={id} onClick={() => onChange(id)}>
            {I ? <I size={14} /> : <span style={{ fontSize: 10 }}>∅</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Control genérico a partir de la definición de un campo del catálogo. */
export function FieldControl({ field, value, onChange, live }: { field: Field; value: any; onChange: (v: any) => void; live?: Live }) {
  switch (field.type) {
    case 'text':
      return <TextInput value={value} onChange={onChange} />;
    case 'textarea':
      return <TextInput value={value} onChange={onChange} multiline />;
    case 'number':
      return <NumberInput value={value} min={field.min} max={field.max} step={field.step} onChange={onChange} {...live} />;
    case 'color':
      return <ColorInput value={value} onChange={onChange} {...live} />;
    case 'boolean':
      return <Toggle value={!!value} onChange={onChange} />;
    case 'select':
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'font':
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {FONTS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      );
    case 'asset':
      return <AssetPicker value={value} onChange={onChange} types={field.assetTypes} />;
    case 'icon':
      return <IconPicker value={value} onChange={onChange} />;
    case 'panels': {
      const panels: any[] = Array.isArray(value) ? value : [];
      return (
        <div>
          {panels.map((panel, i) => (
            <div key={i} className="panel-card">
              <div className="section-title" style={{ marginBottom: 8 }}>Panel {i + 1}</div>
              {field.panelFields?.map((pf) => (
                <div key={pf.key} className={`field ${pf.type === 'boolean' ? '' : ''}`}>
                  <label>{pf.label}</label>
                  <FieldControl
                    field={pf}
                    value={panel[pf.key]}
                    live={live}
                    onChange={(v) => {
                      const next = panels.map((x, j) => (j === i ? { ...x, [pf.key]: v } : x));
                      onChange(next);
                    }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }
  }
}
