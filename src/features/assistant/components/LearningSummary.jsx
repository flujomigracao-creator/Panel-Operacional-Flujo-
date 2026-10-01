import React, { useEffect, useState } from 'react';
import { listarCreativos, resumirPorServicio, formatear } from '../services/creativesService';

/** Resumen por servicio con datos reales: experimentos, creativos, conversaciones, clientes. */
export default function LearningSummary({ experiments }) {
  const [filas, setFilas] = useState(null);

  useEffect(() => {
    let vivo = true;
    listarCreativos().then(c => { if (vivo) setFilas(resumirPorServicio(c, experiments || [])); }).catch(() => { if (vivo) setFilas([]); });
    return () => { vivo = false; };
  }, [experiments]);

  if (!filas || filas.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {filas.map(f => (
        <div key={f.servicio} className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-3">
          <p className="text-xs font-bold text-chrome-text-active">{f.servicio}</p>
          <p className="mt-1 text-[11px] text-chrome-text-muted">
            {f.experimentos} experimentos ({f.concluidos} concluidos) · {f.creativos} creativos
          </p>
          <p className="text-[11px] text-chrome-text">
            {formatear(f.conversaciones, 'int')} conversaciones · {formatear(f.leads, 'int')} leads · {formatear(f.clientes, 'int')} clientes · {formatear(f.ingresos, 'brl')}
          </p>
        </div>
      ))}
    </div>
  );
}
