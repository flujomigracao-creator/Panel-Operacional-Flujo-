import React, { useEffect, useState } from 'react';
import { Plus, Search, UserPlus } from 'lucide-react';
import { searchClients } from '../services/clientDetailService';

/**
 * Buscador de clientes por nombre o teléfono. Si no aparece, permite crear
 * uno nuevo solo con nombre (familiares que no escriben por Kommo).
 */
export default function ClientPicker({ excludeIds = [], onPick, onCreate, placeholder = 'Buscar por nombre o teléfono…' }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = text.trim();
    if (t.length < 2) { setResults([]); return; }
    setLoading(true);
    const id = setTimeout(async () => {
      try { setResults(await searchClients(t, excludeIds)); } catch { setResults([]); } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(id);
  }, [text, excludeIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-md border border-chrome-border bg-chrome-bg px-2 py-1.5">
        <Search size={13} className="text-chrome-text-muted" />
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-chrome-text-active outline-none placeholder:text-chrome-text-muted"
        />
      </div>
      {text.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-chrome-border bg-chrome-bg-raised shadow-lg">
          {loading && <p className="px-3 py-2 text-xs text-chrome-text-muted">Buscando…</p>}
          {!loading && results.map(r => (
            <button
              key={r.id}
              onClick={() => { onPick(r); setText(''); }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-chrome-text-active hover:bg-chrome-bg-active"
            >
              <span className="truncate">{r.full_name}</span>
              <span className="shrink-0 text-xs text-chrome-text-muted">{r.phone || 'sin teléfono'}</span>
            </button>
          ))}
          {!loading && onCreate && (
            <button
              onClick={() => { onCreate(text.trim()); setText(''); }}
              className="flex w-full items-center gap-2 border-t border-chrome-border px-3 py-2 text-left text-sm text-sky-400 hover:bg-chrome-bg-active"
            >
              {results.length ? <Plus size={13} /> : <UserPlus size={13} />} Crear cliente nuevo “{text.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
