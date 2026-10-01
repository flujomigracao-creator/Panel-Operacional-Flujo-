import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { estadoMeta } from '../services/creativesService';

const TITULO = {
  sin_credenciales: 'Meta Ads sin credenciales',
  token_invalido: 'Token de Meta inválido o vencido',
  permisos_insuficientes: 'El token de Meta no tiene permisos suficientes',
  cuenta_no_accesible: 'La cuenta publicitaria no es accesible',
  limite_de_uso: 'Meta limitó temporalmente las llamadas',
  problema_de_pago: 'Problema de pago en Meta',
  pago_pendiente: 'Cuenta publicitaria con problema de pago',
  periodo_gracia: 'Cuenta en período de gracia por pago',
  deshabilitada: 'Cuenta publicitaria deshabilitada',
  revision_riesgo: 'Cuenta en revisión de riesgo',
  cerrada: 'Cuenta publicitaria cerrada',
};

/** Muestra sin maquillar el estado real de la conexión con Meta (errores de token, permisos, cuenta o pago). */
export default function MetaStatusBanner() {
  const [estado, setEstado] = useState(null);
  const [fallo, setFallo] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setFallo(null);
    try { setEstado(await estadoMeta()); } catch (e) { setFallo(e.message); } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (fallo) {
    return <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-400">No se pudo comprobar el estado de Meta: {fallo}</p>;
  }
  if (!estado) return cargando ? <p className="text-[11px] text-chrome-text-muted">Comprobando conexión con Meta…</p> : null;

  if (estado.ok) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-emerald-400">
        <CheckCircle2 size={13} /> Meta conectado · cuenta {estado.cuenta?.nombre || estado.cuenta?.id} ({estado.cuenta?.moneda})
        {!estado.config?.page_id_configurado && <span className="text-amber-400"> · falta META_PAGE_ID para publicar anuncios</span>}
      </p>
    );
  }

  const p = estado.problema || {};
  return (
    <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} /> {TITULO[p.tipo] || 'Meta Ads no está disponible'}</p>
        <button onClick={cargar} disabled={cargando} className="inline-flex items-center gap-1 text-[11px] text-red-300 underline disabled:opacity-50">
          <RefreshCw size={11} className={cargando ? 'animate-spin' : ''} /> Reintentar
        </button>
      </div>
      <p className="mt-1">{p.explicacion}</p>
      {p.meta?.mensaje && p.meta.mensaje !== p.explicacion && <p className="mt-1 text-red-300/80">Meta dice: {p.meta.mensaje}{p.meta.fbtrace_id ? ` [fbtrace_id ${p.meta.fbtrace_id}]` : ''}</p>}
      <p className="mt-1 text-red-300/70">Mientras tanto se muestran los últimos datos guardados en Supabase; no se pueden sincronizar ni publicar cambios en Meta.</p>
    </div>
  );
}
