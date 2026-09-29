import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { inputCls, selectCls, btnCls, btnPrimaryCls } from '@features/crm/format';
import { detectarDatosPersonales, limpiarDatosPersonales } from '../../privacy';
import { PrivacyWarning } from './KnowledgeStatus';

// Editor lateral para cualquier tipo de conocimiento.
// fields: [{ key, label, type: 'text'|'textarea'|'select'|'tags'|'number'|'checkbox', rows?, options?, suggestions?, section?, required?, hint? }]
// meta: [[etiqueta, valor]] (información de solo lectura) · actions: [{ label, onClick(values), tone?, icon? }]
// privacy: claves de los campos donde se buscan datos personales.
export default function KnowledgeEditor({ title, item, fields, meta = [], actions = [], onSave, onClose, saveLabel = 'Guardar cambios', aviso, privacy = [], header }) {
  const inicial = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f.type === 'tags' ? (item?.[f.key] || []).join(', ') : (item?.[f.key] ?? (f.type === 'checkbox' ? false : ''))])), [item, fields]);
  const [v, setV] = useState(inicial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(inicial), [inicial]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const valores = () => Object.fromEntries(fields.map((f) => {
    const x = v[f.key];
    if (f.type === 'tags') return [f.key, String(x || '').split(',').map((t) => t.trim()).filter(Boolean)];
    if (f.type === 'number') return [f.key, x === '' ? null : Number(x)];
    if (f.type === 'checkbox') return [f.key, !!x];
    return [f.key, typeof x === 'string' ? x.trim() || null : x];
  }));
  const faltan = fields.filter((f) => f.required && !String(v[f.key] ?? '').trim()).map((f) => f.label);
  const cambiado = JSON.stringify(v) !== JSON.stringify(inicial);
  const datosPersonales = detectarDatosPersonales(privacy.map((k) => v[k]).join('\n'));
  const limpiar = () => setV((prev) => ({ ...prev, ...Object.fromEntries(privacy.map((k) => [k, limpiarDatosPersonales(prev[k]).texto])) }));

  const correr = async (fn) => {
    setBusy(true);
    try {
      await fn(valores());
    } catch (err) {
      if (!err?.avisado) toast.error(err?.message || 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  let seccion = null;
  return (
    <div className="fixed inset-0 z-[250] flex justify-end bg-surface-overlay" onMouseDown={onClose}>
      <aside className="flex h-full w-full max-w-[640px] flex-col border-l border-border bg-bg-surface shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2 border-b border-border px-5 py-3">
          <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text-primary">{title}</h2>
          {header}
          <button className="rounded p-1 text-text-muted hover:bg-bg-elevated" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {aviso && <p className="rounded-md bg-bg-elevated px-3 py-2 text-xs text-text-secondary">{aviso}</p>}
          <PrivacyWarning tipos={datosPersonales} onLimpiar={limpiar} />
          {fields.map((f) => {
            const titulo = f.section && f.section !== seccion ? (seccion = f.section) : null;
            const id = `ke-${f.key}`;
            return (
              <React.Fragment key={f.key}>
                {titulo && <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{titulo}</p>}
                <div>
                  {f.type !== 'checkbox' && <label htmlFor={id} className="mb-1 block text-xs font-medium text-text-secondary">{f.label}{f.required && ' *'}</label>}
                  {f.type === 'textarea' && (
                    <textarea id={id} className={`${inputCls} resize-y leading-relaxed`} rows={f.rows || 4} value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
                  )}
                  {f.upload && (
                    <label className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-brand-primary hover:underline">
                      Cargar desde archivo (.md o .txt)
                      <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const contenido = await file.text();
                        setV((prev) => ({
                          ...prev,
                          [f.key]: contenido,
                          ...(f.titleKey && !String(prev[f.titleKey] || '').trim() ? { [f.titleKey]: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') } : {}),
                        }));
                        e.target.value = '';
                      }} />
                    </label>
                  )}
                  {f.type === 'select' && (
                    <select id={id} className={selectCls} value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                      {f.options.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
                    </select>
                  )}
                  {f.type === 'checkbox' && (
                    <label className="flex items-center gap-2 text-[13px] text-text-primary">
                      <input id={id} type="checkbox" checked={!!v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.checked })} /> {f.label}
                    </label>
                  )}
                  {(!f.type || f.type === 'text' || f.type === 'tags' || f.type === 'number') && (
                    <>
                      <input id={id} type={f.type === 'number' ? 'number' : 'text'} min={f.min} max={f.max} className={inputCls} value={v[f.key] ?? ''}
                        list={f.suggestions ? `${id}-list` : undefined} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
                      {f.suggestions && <datalist id={`${id}-list`}>{f.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
                    </>
                  )}
                  {f.hint && <p className="mt-1 text-[11px] text-text-muted">{f.hint}</p>}
                </div>
              </React.Fragment>
            );
          })}
          {meta.length > 0 && (
            <div className="rounded-md border border-border">
              <p className="border-b border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Información</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3 py-2 text-xs">
                {meta.map(([k, val]) => (
                  <React.Fragment key={k}>
                    <dt className="text-text-muted">{k}</dt>
                    <dd className="text-text-primary">{val ?? '—'}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          )}
        </div>
        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          {faltan.length > 0 && <p className="mr-auto text-[11px] text-text-muted">Falta: {faltan.join(', ')}</p>}
          <div className="ml-auto flex flex-wrap gap-2">
            {actions.map((a) => (
              <button key={a.label} className={a.tone === 'danger' ? `${btnCls} text-danger hover:!bg-danger-bg` : a.tone === 'success' ? `${btnCls} !border-success-border text-success hover:!bg-success-bg` : btnCls}
                disabled={busy || a.disabled || (a.needsValid && faltan.length > 0)} onClick={() => correr(a.onClick)}>
                {a.icon}{a.label}
              </button>
            ))}
            {onSave && (
              <button className={btnPrimaryCls} disabled={busy || faltan.length > 0 || (!cambiado && item?.id)} onClick={() => correr(onSave)}>
                {busy ? 'Guardando…' : saveLabel}
              </button>
            )}
          </div>
        </footer>
      </aside>
    </div>
  );
}
