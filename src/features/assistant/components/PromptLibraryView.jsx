import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Copy,
  Check,
  Plus,
  Sparkles,
  TrendingUp,
  DollarSign,
  Users,
  MessageSquare,
  ArrowRight,
  Filter,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import * as api from '../services/assistantService';

const SERVICIOS = [
  'CPF',
  'Agendamento PF',
  'RNM',
  'Residência Permanente',
  'Refúgio',
];

export default function PromptLibraryView({
  prompts = [],
  onRefresh,
  onAskAssistant,
  onUsePromptInCreator,
}) {
  const [selectedService, setSelectedService] = useState('all');
  const [copiedId, setCopiedId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Formulario nuevo prompt
  const [nombre, setNombre] = useState('');
  const [service, setService] = useState('CPF');
  const [concepto, setConcepto] = useState('servicio_directo');
  const [version, setVersion] = useState('v1.0');
  const [promptText, setPromptText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const copiarPrompt = (id, texto) => {
    navigator.clipboard?.writeText(texto);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const guardarNuevoPrompt = async (e) => {
    e.preventDefault();
    if (!nombre.trim() || !promptText.trim()) {
      setErrorMsg('Nombre y contenido del prompt son obligatorios.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    try {
      await api.saveCreativePrompt({
        nombre: nombre.trim(),
        service,
        concepto,
        version: version.trim() || 'v1.0',
        prompt: promptText.trim(),
        variables: {
          tono: 'Profesional legal hispanoamericano',
          canal: 'Meta Ads WhatsApp',
        },
      });
      setSuccessMsg('Prompt registrado en la biblioteca.');
      setNombre('');
      setPromptText('');
      setShowAddModal(false);
      if (onRefresh) onRefresh();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const promptsFiltrados = useMemo(() => {
    if (selectedService === 'all') return prompts;
    return prompts.filter(p => p.service?.toLowerCase().includes(selectedService.toLowerCase()));
  }, [prompts, selectedService]);

  return (
    <div className="space-y-6">
      {/* Cabecera con Filtros y Botón para Agregar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-chrome-border/60 pb-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-chrome-text-muted flex items-center gap-1">
            <BookOpen size={14} />
            <span>Biblioteca de Prompts ({prompts.length})</span>
          </span>

          <div className="inline-flex rounded-lg border border-chrome-border bg-chrome-bg-raised p-0.5 ml-2">
            {['all', ...SERVICIOS].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedService(s)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedService === s
                    ? 'bg-brand-primary text-white'
                    : 'text-chrome-text hover:text-chrome-text-active'
                }`}
              >
                {s === 'all' ? 'Todos' : s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary/90 transition-colors shadow-sm"
          >
            <Plus size={13} />
            <span>Registrar Nuevo Prompt</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-chrome-border bg-chrome-bg-raised p-1.5 text-xs text-chrome-text hover:text-chrome-text-active"
            title="Refrescar prompts"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 size={14} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Modal / Formulario para Agregar Prompt */}
      {showAddModal && (
        <div className="rounded-xl border border-brand-primary/30 bg-chrome-bg-raised p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-primary">
              Registrar Nuevo Prompt Publicitario
            </h4>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="text-xs text-chrome-text-muted hover:text-chrome-text"
            >
              Cancelar
            </button>
          </div>

          <form onSubmit={guardarNuevoPrompt} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-chrome-text-muted mb-1">
                  Nombre descriptivo
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Promocional CPF - Golden Hour"
                  className="w-full rounded-lg border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-xs text-chrome-text focus:border-brand-primary focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-chrome-text-muted mb-1">
                  Servicio
                </label>
                <select
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  className="w-full rounded-lg border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-xs text-chrome-text focus:border-brand-primary focus:outline-none"
                >
                  {SERVICIOS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-chrome-text-muted mb-1">
                  Versión
                </label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="v1.0"
                  className="w-full rounded-lg border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-xs text-chrome-text focus:border-brand-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-chrome-text-muted mb-1">
                Instrucción / Prompt Completo
              </label>
              <textarea
                rows={3}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Escribe la instrucción exacta utilizada para la imagen o copy..."
                className="w-full rounded-lg border border-chrome-border bg-chrome-bg p-2.5 text-xs text-chrome-text font-mono focus:border-brand-primary focus:outline-none"
                required
              />
            </div>

            {errorMsg && (
              <p className="text-xs text-amber-400 font-medium">{errorMsg}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-chrome-border bg-chrome-bg px-3 py-1.5 text-xs text-chrome-text"
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-50"
              >
                {isSaving ? 'Guardando...' : 'Guardar Prompt'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grid de Prompts */}
      {promptsFiltrados.length === 0 ? (
        <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-8 text-center text-xs text-chrome-text-muted">
          No hay prompts registrados en la biblioteca para este servicio.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {promptsFiltrados.map((p) => {
            const isCopied = copiedId === p.id;

            return (
              <div
                key={p.id}
                className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4 space-y-3 flex flex-col justify-between hover:border-brand-primary/40 transition-colors"
              >
                <div className="space-y-2.5">
                  {/* Encabezado */}
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-brand-primary/10 px-2 py-0.5 text-[10px] font-semibold text-brand-primary">
                      {p.service}
                    </span>
                    <span className="text-[10px] text-chrome-text-muted font-mono">
                      {p.version || 'v1.0'}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-chrome-text-active">
                    {p.nombre}
                  </h4>

                  {/* Bloque de Código del Prompt */}
                  <div className="relative rounded-lg bg-neutral-950 p-2.5 font-mono text-[11px] text-neutral-300 border border-neutral-800">
                    <p className="line-clamp-4 pr-6 leading-relaxed">
                      {p.prompt}
                    </p>
                    <button
                      type="button"
                      onClick={() => copiarPrompt(p.id, p.prompt)}
                      className="absolute top-2 right-2 rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                      title="Copiar prompt"
                    >
                      {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>

                  {/* Métricas Acumuladas del Prompt */}
                  <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-chrome-bg/50 p-2 text-center text-[10px] border border-chrome-border/40">
                    <div>
                      <span className="text-chrome-text-muted block">Creativos</span>
                      <span className="font-semibold text-chrome-text">{p.creativos_generados || 0}</span>
                    </div>
                    <div>
                      <span className="text-chrome-text-muted block">Clientes</span>
                      <span className="font-bold text-emerald-400">{p.clientes || 0}</span>
                    </div>
                    <div>
                      <span className="text-chrome-text-muted block">Costo / Cli.</span>
                      <span className="font-bold text-chrome-text-active">
                        {p.costo_por_cliente ? `R$ ${Number(p.costo_por_cliente).toFixed(0)}` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (onUsePromptInCreator) onUsePromptInCreator(p);
                    }}
                    className="flex-1 rounded-lg border border-brand-primary/30 bg-brand-primary/5 py-1.5 text-[11px] font-semibold text-brand-primary hover:bg-brand-primary/15 transition-colors text-center"
                  >
                    Usar en Creador
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onAskAssistant(
                        `Analiza el prompt "${p.nombre}" para ${p.service}. ¿Cómo podemos iterar su instrucción visual para mejorar la tasa de conversión a clientes pagadores?`
                      )
                    }
                    className="rounded-lg border border-chrome-border bg-chrome-bg p-1.5 text-chrome-text hover:text-brand-primary"
                    title="Iterar con Asistente"
                  >
                    <Sparkles size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
