import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Sparkles } from 'lucide-react';
import { btnPrimaryCls, inputCls } from '@features/crm/format';
import { probarNora } from '../services/noraService';
import { PriorityBadge, fuenteLabel } from './kit/KnowledgeStatus';

const SECCION = { document: 'documentos', approved_answer: 'respuestas', case: 'casos', lesson: 'aprendizajes', memory: 'memorias' };

// Por qué una fuente llegó a Nora, en palabras.
function motivo(f) {
  const base = {
    document: 'Es información oficial: tiene la mayor prioridad.',
    approved_answer: 'Es una respuesta que ya validaste.',
    case: 'Es un antecedente parecido (orienta, no es una regla).',
    lesson: 'Es una lección aprobada de conversaciones anteriores.',
    memory: 'Es un dato de este mismo cliente.',
  }[f.tipo || f.source_type] || '';
  const sim = f.similitud ?? f.similarity;
  return `${base} Parecido con el mensaje: ${Math.round((sim || 0) * 100)}%.`;
}

// Lista de fuentes usadas (en una prueba o en una respuesta real de Nora).
export function FuentesUsadas({ fuentes, onOpen }) {
  if (!fuentes?.length) return <p className="text-xs text-text-muted">No encontró conocimiento parecido: responde solo con sus reglas y datos de la empresa.</p>;
  return (
    <ol className="space-y-1.5">
      {fuentes.map((f, i) => {
        const tipo = f.tipo || f.source_type;
        const id = f.id || f.source_id;
        return (
          <li key={`${id}-${i}`} className="rounded-md border border-border px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-text-primary">{i + 1}. {fuenteLabel(tipo)}</span>
              {f.metadata?.documento && <span className="text-text-muted">· {f.metadata.documento}</span>}
              {onOpen && SECCION[tipo] && <button className="ml-auto text-brand-primary hover:underline" onClick={() => onOpen(SECCION[tipo], tipo === 'document' ? f.metadata?.documento_id : id)}>Ver</button>}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{f.extracto || f.content}</p>
            <p className="mt-1 text-[11px] text-text-muted">{motivo(f)}</p>
          </li>
        );
      })}
    </ol>
  );
}

// "¿Qué usaría Nora?": escribe un mensaje de cliente y mira qué conocimiento le llegaría y por qué.
export default function KnowledgePreview({ onOpen }) {
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const probar = async () => {
    setBusy(true);
    try { setRes(await probarNora(texto)); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const criticas = (res?.reglas || []).filter((r) => r.prioridad === 'critica');
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input className={inputCls} placeholder="Ej.: ¿Cuánto demora el agendamiento en la Polícia Federal?" value={texto}
          onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && texto.trim() && probar()} />
        <button className={btnPrimaryCls} disabled={busy || !texto.trim()} onClick={probar}><Sparkles size={13} /> {busy ? 'Buscando…' : 'Probar'}</button>
      </div>
      {res && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Conocimiento que le llegaría</p>
            <FuentesUsadas fuentes={res.fuentes} onOpen={onOpen} />
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Reglas que respeta siempre ({(res.reglas || []).length})</p>
            <ul className="space-y-1">
              {(criticas.length ? criticas : (res.reglas || []).slice(0, 5)).map((r) => (
                <li key={r.id} className="flex gap-2 text-xs text-text-secondary"><PriorityBadge prioridad={r.prioridad} /><span className="line-clamp-2">{r.texto}</span></li>
              ))}
            </ul>
            {onOpen && <button className="mt-1.5 text-xs text-brand-primary hover:underline" onClick={() => onOpen('reglas')}>Ver todas las reglas</button>}
          </div>
        </div>
      )}
    </div>
  );
}
