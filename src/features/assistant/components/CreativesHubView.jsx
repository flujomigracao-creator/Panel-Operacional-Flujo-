import React, { useState, useMemo } from 'react';
import {
  Palette,
  Sparkles,
  Layers,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Sliders,
  DollarSign,
  MessageSquare,
  Users,
  Award,
  Eye,
  Plus,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import * as api from '../services/assistantService';

const SERVICIOS = [
  'CPF',
  'Agendamento PF',
  'RNM',
  'Residência Permanente',
  'Refúgio',
];

const FORMATOS = [
  { id: '1:1', label: '1:1 Feed Cuadrado', ratio: 'aspect-square' },
  { id: '4:5', label: '4:5 Portrait Feed', ratio: 'aspect-[4/5]' },
  { id: '9:16', label: '9:16 Stories / Reels', ratio: 'aspect-[9/16]' },
];

const CONCEPTOS = [
  {
    id: 'persona_documentacion',
    nombre: 'Concepto 01: Persona + Documentación + Brasil',
    descripcion: 'Inmigrante hispanoamericano en Brasil sosteniendo documentación con expresión de alivio y confianza.',
  },
  {
    id: 'problema_solucion',
    nombre: 'Concepto 02: Problema burocrático → Solución legal',
    descripcion: 'Contraste visual entre filas/confusión vs asesoría digital rápida y aprobación sin estrés.',
  },
  {
    id: 'servicio_directo',
    nombre: 'Concepto 03: Servicio específico + Mensaje directo',
    descripcion: 'Asesor migratorio entregando trámite con mensaje directo, claro y llamada inmediata a WhatsApp.',
  },
  {
    id: 'institucional',
    nombre: 'Concepto 04: Institucional / Despacho de Alta Autoridad',
    descripcion: 'Estética corporativa sobria, pasaportes, sellos oficiales y respaldo de más de 10 años de experiencia.',
  },
  {
    id: 'ganador_historico',
    nombre: 'Concepto 05: Variación del concepto ganador histórico',
    descripcion: 'Joven profesional caminando seguro en São Paulo/Río con su documento listo en tiempo récord.',
  },
];

// Presets de imágenes de alta fidelidad publicitaria para demostración inmediata
const IMAGENES_PRESET = {
  persona_documentacion: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=80',
  problema_solucion: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80',
  servicio_directo: 'https://images.unsplash.com/photo-1556745757-8d76bdb6984b?auto=format&fit=crop&w=800&q=80',
  institucional: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
  ganador_historico: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
};

export default function CreativesHubView({
  creatives = [],
  prompts = [],
  onRefresh,
  onAskAssistant,
}) {
  const [activeSubTab, setActiveSubTab] = useState('creator'); // 'creator' | 'gallery' | 'comparator'
  const [selectedService, setSelectedService] = useState('all');
  const [sortMetric, setSortMetric] = useState('costo_por_cliente');
  const [selectedCompareIds, setSelectedCompareIds] = useState([]);

  // Estado del Creador de Creativos
  const [formService, setFormService] = useState('CPF');
  const [formFormat, setFormFormat] = useState('1:1');
  const [formConcept, setFormConcept] = useState('persona_documentacion');
  const [formHeadline, setFormHeadline] = useState('Tu CPF en Brasil, seguro y sin complicaciones');
  const [formPrimaryText, setFormPrimaryText] = useState('Llegar a un nuevo país ya tiene suficientes desafíos. Regulariza tu trámite con el equipo legal de Flujo de Migração y evita errores que demoren tu proceso. Atención 100% en español.');
  const [formPromptImg, setFormPromptImg] = useState('Professional commercial advertising photography, square 1:1. Realistic South American immigrant in Brazil holding clean legal documentation folder, smiling with relief and confidence, warm natural golden hour lighting, cinematic color grading, 8k resolution.');
  const [formImageUrl, setFormImageUrl] = useState(IMAGENES_PRESET.persona_documentacion);
  const [formCta, setFormCta] = useState('Enviar mensaje');
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);

  // Generador de conceptos con IA determinista orientado a publicidad científica
  const generarConceptoIA = () => {
    let hl = '';
    let copy = '';
    let pImg = '';
    const aspecto = formFormat === '9:16' ? 'vertical 9:16 for Stories/Reels' : formFormat === '4:5' ? 'portrait 4:5 for Feed' : 'square 1:1 for Feed';

    switch (formConcept) {
      case 'persona_documentacion':
        pImg = `Professional commercial advertising photography, ${aspecto}. Realistic South American immigrant in Brazil holding clean legal documentation folder, smiling with relief and confidence, modern urban Brazilian architectural background, warm natural golden hour lighting, cinematic color grading, 8k resolution.`;
        hl = `Tu ${formService} en Brasil, seguro y sin complicaciones`;
        copy = `Llegar a un nuevo país ya tiene suficientes desafíos. Regulariza tu ${formService} con el equipo legal de Flujo de Migração y evita errores que demoren tu proceso. Atención 100% en español.`;
        break;
      case 'problema_solucion':
        pImg = `High-end conceptual advertising photography, ${aspecto}. Visual contrast split: left side representing bureaucratic documents and queues, right side showing a calm professional consultation with digital approval and warm lighting, sophisticated legal service branding style.`;
        hl = `¿Complicaciones con tu ${formService}? Lo resolvemos`;
        copy = `Olvídate de las filas interminables y los formularios confusos de la Receita y la Policía Federal. Te acompañamos paso a paso hasta que tengas tu trámite listo en mano.`;
        break;
      case 'institucional':
        pImg = `Modern corporate architectural and legal office aesthetic, ${aspecto}. Professional desk with Brazilian legal paperwork, elegant brass pen, official passport, soft ambient office lighting, clean minimalist composition, high authority commercial look, 8k resolution.`;
        hl = `Asesoría Legal Especializada en Migración Brasileña`;
        copy = `Flujo de Migração: Más de 10 años de experiencia ayudando a extranjeros a obtener su ${formService} y residencia legal en Brasil con respaldo profesional garantizado.`;
        break;
      case 'ganador_historico':
        pImg = `Action-oriented editorial marketing photography, ${aspecto}. Young expat in São Paulo or Rio holding their official Brazilian document with a joyful relaxed smile while walking along a sunny modern avenue, authentic candid style, vibrant daylight.`;
        hl = `Tu ${formService} listo en tiempo récord`;
        copy = `El trámite más importante para trabajar, abrir cuenta bancaria y vivir legalmente en Brasil. Toca el botón para hablar directamente con nuestro equipo por WhatsApp.`;
        break;
      case 'servicio_directo':
      default:
        pImg = `Clean commercial advertising photo, ${aspecto}. Warm and approachable immigration advisor in modern Brazilian office environment presenting approved official documents with friendly welcoming smile, studio lighting, hyper realistic.`;
        hl = `Tramita tu ${formService} hoy mismo`;
        copy = `Obtén tu ${formService} en Brasil sin demoras innecesarias. Te guiamos con los requisitos exactos y preparamos toda tu documentación. Inicia ahora por WhatsApp.`;
        break;
    }

    setFormHeadline(hl);
    setFormPrimaryText(copy);
    setFormPromptImg(pImg);
    setFormImageUrl(IMAGENES_PRESET[formConcept] || IMAGENES_PRESET.servicio_directo);
  };

  const guardarCreativo = async () => {
    setIsSaving(true);
    setSaveSuccessMsg(null);
    try {
      await api.saveCampaignCreative({
        service: formService,
        format: formFormat,
        visual_concept: formConcept,
        headline: formHeadline,
        primary_text: formPrimaryText,
        prompt_text: formPromptImg,
        image_url: formImageUrl,
        cta: formCta,
        prompt_id: selectedPromptId || undefined,
        status: 'draft',
      });
      setSaveSuccessMsg('Creativo guardado exitosamente en la biblioteca.');
      if (onRefresh) onRefresh();
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err) {
      alert(`Error al guardar el creativo: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const proponerAlAsistente = () => {
    const promptMsg = `Diseña un experimento V5 para el servicio ${formService} utilizando el creativo recién generado:
- Formato: ${formFormat}
- Concepto Visual: ${formConcept}
- Titular (Headline): "${formHeadline}"
- Copy Principal: "${formPrimaryText}"
- Llamada a la acción: "${formCta}"
- Prompt de Imagen: "${formPromptImg}"

Formula la hipótesis científica, define la variante control vs tratamiento, establece la métrica primaria de negocio (costo por cliente pagador) y genera la propuesta ai_proposals para confirmación humana.`;
    onAskAssistant(promptMsg);
  };

  // Filtrado y ordenamiento de la Galería
  const creativosFiltrados = useMemo(() => {
    let lista = [...creatives];
    if (selectedService !== 'all') {
      lista = lista.filter(c => c.service?.toLowerCase().includes(selectedService.toLowerCase()));
    }
    return lista.sort((a, b) => {
      if (sortMetric === 'conversaciones') return (b.conversations || 0) - (a.conversations || 0);
      if (sortMetric === 'clientes') return (b.paying_customers || 0) - (a.paying_customers || 0);
      if (sortMetric === 'ctr') return (b.ctr || 0) - (a.ctr || 0);
      // Costo por cliente: menor es mejor (nulls al final)
      if (a.cost_per_customer && b.cost_per_customer) return a.cost_per_customer - b.cost_per_customer;
      if (a.cost_per_customer) return -1;
      if (b.cost_per_customer) return 1;
      return (b.conversations || 0) - (a.conversations || 0);
    });
  }, [creatives, selectedService, sortMetric]);

  const toggleSelectCompare = (id) => {
    setSelectedCompareIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      if (prev.length >= 4) {
        alert('Puedes comparar un máximo de 4 creativos simultáneamente (A vs B vs C vs D).');
        return prev;
      }
      return [...prev, id];
    });
  };

  // Creativos seleccionados para la comparación
  const creativosComparados = useMemo(() => {
    return creatives.filter(c => selectedCompareIds.includes(c.id));
  }, [creatives, selectedCompareIds]);

  // Ganador científico entre los seleccionados
  const ganadorComparador = useMemo(() => {
    if (creativosComparados.length < 2) return null;
    return [...creativosComparados].sort((a, b) => {
      if (a.cost_per_customer && b.cost_per_customer) return a.cost_per_customer - b.cost_per_customer;
      if (a.cost_per_customer) return -1;
      if (b.cost_per_customer) return 1;
      return (b.paying_customers || 0) - (a.paying_customers || 0);
    })[0];
  }, [creativosComparados]);

  return (
    <div className="space-y-6">
      {/* Subnavegación de Creativos */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-chrome-border/60 pb-3">
        <div className="flex items-center gap-1 rounded-lg border border-chrome-border bg-chrome-bg-raised p-1 text-xs">
          <button
            onClick={() => setActiveSubTab('creator')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition-colors ${
              activeSubTab === 'creator'
                ? 'bg-brand-primary text-white'
                : 'text-chrome-text hover:text-chrome-text-active'
            }`}
          >
            <Sparkles size={13} />
            <span>Creador & Estudio</span>
          </button>
          <button
            onClick={() => setActiveSubTab('gallery')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition-colors ${
              activeSubTab === 'gallery'
                ? 'bg-brand-primary text-white'
                : 'text-chrome-text hover:text-chrome-text-active'
            }`}
          >
            <Layers size={13} />
            <span>Galería & Ranking ({creatives.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('comparator')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition-colors ${
              activeSubTab === 'comparator'
                ? 'bg-brand-primary text-white'
                : 'text-chrome-text hover:text-chrome-text-active'
            }`}
          >
            <Award size={13} />
            <span>Comparador A vs B vs C vs D ({selectedCompareIds.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {selectedCompareIds.length >= 2 && activeSubTab !== 'comparator' && (
            <button
              onClick={() => setActiveSubTab('comparator')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-primary/40 bg-brand-primary/10 px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/20 transition-colors"
            >
              <Award size={13} />
              <span>Ver Comparador ({selectedCompareIds.length})</span>
            </button>
          )}
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1 rounded-lg border border-chrome-border bg-chrome-bg-raised px-2.5 py-1.5 text-xs font-medium text-chrome-text hover:text-chrome-text-active"
            title="Refrescar creativos"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* ── SECCIÓN 1: CREADOR & ESTUDIO DE CREATIVOS ── */}
      {activeSubTab === 'creator' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Columna Izquierda: Parámetros e Inteligencia de Creación (7 cols) */}
          <div className="space-y-5 lg:col-span-7">
            <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-chrome-text-active flex items-center gap-2">
                  <Palette size={16} className="text-brand-primary" />
                  <span>Estudio Científico de Creativos</span>
                </h3>
                <span className="rounded bg-brand-primary/10 px-2 py-0.5 text-[10px] font-semibold text-brand-primary">
                  Motor V5
                </span>
              </div>

              {/* Selector de Servicio (Mantiene servicios separados) */}
              <div>
                <label className="block text-xs font-semibold text-chrome-text-muted mb-1.5">
                  1. Servicio Migratorio Objetivo
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SERVICIOS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormService(s)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold text-left transition-all ${
                        formService === s
                          ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                          : 'border-chrome-border bg-chrome-bg text-chrome-text hover:border-chrome-border-active'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Formato y Concepto */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-chrome-text-muted mb-1.5">
                    2. Formato Publicitario
                  </label>
                  <div className="space-y-1.5">
                    {FORMATOS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFormFormat(f.id)}
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-xs text-left font-medium transition-all ${
                          formFormat === f.id
                            ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                            : 'border-chrome-border bg-chrome-bg text-chrome-text hover:border-chrome-border-active'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-chrome-text-muted mb-1.5">
                    3. Concepto Visual
                  </label>
                  <select
                    value={formConcept}
                    onChange={(e) => setFormConcept(e.target.value)}
                    className="w-full rounded-lg border border-chrome-border bg-chrome-bg p-2 text-xs text-chrome-text focus:border-brand-primary focus:outline-none"
                  >
                    {CONCEPTOS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] text-chrome-text-muted leading-relaxed">
                    {CONCEPTOS.find(c => c.id === formConcept)?.descripcion}
                  </p>
                </div>
              </div>

              {/* Botón de Generación Asistida */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={generarConceptoIA}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:from-brand-primary/90 hover:to-indigo-500 transition-all"
                >
                  <Sparkles size={14} />
                  <span>Generar Ángulo Persuasivo y Prompt para {formService}</span>
                </button>
              </div>

              {/* Prompt de Imagen Orientado a Publicidad Profesional */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-chrome-text-muted">
                  Prompt Profesional para la Imagen (Midjourney / Imagen 3 / DALL-E)
                </label>
                <textarea
                  rows={3}
                  value={formPromptImg}
                  onChange={(e) => setFormPromptImg(e.target.value)}
                  className="w-full rounded-lg border border-chrome-border bg-chrome-bg p-2.5 text-xs text-chrome-text font-mono focus:border-brand-primary focus:outline-none"
                  placeholder="Instrucción detallada de imagen publicitaria..."
                />
              </div>

              {/* URL de la Imagen */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-chrome-text-muted">
                  URL del Activo Visual (Imagen)
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    className="flex-1 rounded-lg border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-xs text-chrome-text focus:border-brand-primary focus:outline-none"
                    placeholder="https://..."
                  />
                  <button
                    type="button"
                    onClick={() => setFormImageUrl(IMAGENES_PRESET[formConcept] || IMAGENES_PRESET.persona_documentacion)}
                    className="rounded-lg border border-chrome-border bg-chrome-bg px-3 py-1.5 text-xs font-medium text-chrome-text hover:bg-chrome-bg-active"
                  >
                    Usar Preset
                  </button>
                </div>
              </div>

              {/* Copywriting: Titular y Texto Principal */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-chrome-text-muted mb-1">
                    Titular del Anuncio (Headline Meta Ads)
                  </label>
                  <input
                    type="text"
                    value={formHeadline}
                    onChange={(e) => setFormHeadline(e.target.value)}
                    className="w-full rounded-lg border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-xs font-medium text-chrome-text focus:border-brand-primary focus:outline-none"
                    placeholder="Ej. Tu CPF en Brasil sin complicaciones"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-chrome-text-muted mb-1">
                    Texto Principal (Copy Persuasivo)
                  </label>
                  <textarea
                    rows={3}
                    value={formPrimaryText}
                    onChange={(e) => setFormPrimaryText(e.target.value)}
                    className="w-full rounded-lg border border-chrome-border bg-chrome-bg p-2.5 text-xs text-chrome-text focus:border-brand-primary focus:outline-none"
                    placeholder="Texto que verá el usuario en el feed..."
                  />
                </div>
              </div>

              {saveSuccessMsg && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}

              {/* Botones de Acción */}
              <div className="flex flex-wrap items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={guardarCreativo}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-primary bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Check size={14} />
                  <span>{isSaving ? 'Guardando...' : 'Guardar en Biblioteca'}</span>
                </button>

                <button
                  type="button"
                  onClick={proponerAlAsistente}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-4 py-2 text-xs font-semibold text-brand-primary hover:bg-brand-primary/20 transition-colors"
                >
                  <ArrowRight size={14} />
                  <span>Proponer Experimento V5 con este Creativo</span>
                </button>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Mockup / Previsualizador de Anuncio en Red Social (5 cols) */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4 space-y-3 sticky top-4">
              <div className="flex items-center justify-between border-b border-chrome-border/60 pb-2">
                <span className="text-xs font-semibold text-chrome-text-muted flex items-center gap-1.5">
                  <Eye size={13} />
                  <span>Previsualización Feed Publicitario ({formFormat})</span>
                </span>
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  {formService}
                </span>
              </div>

              {/* Tarjeta Mockup Ad */}
              <div className="rounded-xl border border-chrome-border bg-neutral-950 p-3 shadow-xl space-y-3 text-white w-full max-w-[24rem] mx-auto">
                {/* Cabecera del Ad */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-brand-primary flex items-center justify-center font-bold text-xs text-white">
                      FM
                    </div>
                    <div>
                      <p className="text-xs font-semibold leading-none text-white">Flujo de Migração</p>
                      <p className="text-[10px] text-neutral-400 leading-none mt-1">Publicidad · 🌐</p>
                    </div>
                  </div>
                  <span className="text-neutral-500 text-xs font-mono">···</span>
                </div>

                {/* Texto Principal */}
                <p className="text-xs text-neutral-200 line-clamp-3 leading-relaxed">
                  {formPrimaryText || 'El texto principal persuasivo se mostrará aquí...'}
                </p>

                {/* Contenedor de la Imagen */}
                <div className={`relative overflow-hidden rounded-lg bg-neutral-900 border border-neutral-800 ${
                  formFormat === '9:16' ? 'aspect-[9/16]' : formFormat === '4:5' ? 'aspect-[4/5]' : 'aspect-square'
                }`}>
                  {formImageUrl ? (
                    <img
                      src={formImageUrl}
                      alt="Creativo publicitario"
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
                      Sin imagen cargada
                    </div>
                  )}
                  <div className="absolute top-2 right-2 rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[9px] font-mono font-semibold text-white">
                    {formFormat}
                  </div>
                </div>

                {/* Barra de Conversión WhatsApp */}
                <div className="rounded-lg bg-neutral-900 p-2.5 flex items-center justify-between gap-2 border border-neutral-800">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] text-neutral-400 block uppercase tracking-wider font-semibold">
                      api.whatsapp.com
                    </span>
                    <p className="text-xs font-bold text-white truncate">
                      {formHeadline || 'Titular del anuncio'}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1 rounded bg-[#25D366] px-2.5 py-1 text-[11px] font-bold text-black shadow-sm">
                    <MessageSquare size={12} fill="currentColor" />
                    <span>{formCta}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-chrome-bg p-3 text-[11px] text-chrome-text-muted space-y-1">
                <span className="font-semibold text-chrome-text block">Atribución Cerrada:</span>
                <span>Al publicarse, este creativo vinculará su ID con leads de Nora y pagos para medir su costo por cliente real.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SECCIÓN 2: COMPARADOR CARA A CARA (A vs B vs C vs D) ── */}
      {activeSubTab === 'comparator' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-brand-primary flex items-center gap-1.5">
                <Award size={16} />
                <span>Matriz Comparativa Cara a Cara (A / B / C / D)</span>
              </h3>
              <p className="text-xs text-chrome-text-muted mt-0.5">
                Compara variables controladas (imagen, hook, copy) y su impacto desde el clic hasta el pago en caja.
              </p>
            </div>

            <span className="rounded-lg bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-primary">
              {creativosComparados.length} Seleccionados
            </span>
          </div>

          {creativosComparados.length < 2 ? (
            <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-8 text-center space-y-3">
              <Award size={32} className="mx-auto text-chrome-text-muted" />
              <h4 className="text-sm font-semibold text-chrome-text-active">
                Selecciona al menos 2 creativos para comparar
              </h4>
              <p className="text-xs text-chrome-text-muted max-w-md mx-auto">
                Ve a la pestaña <strong>Galería & Ranking</strong> y marca las casillas de verificación de 2 a 4 variantes (ej. Control vs Variante B) para evaluar cuál genera clientes con menor costo.
              </p>
              <button
                type="button"
                onClick={() => setActiveSubTab('gallery')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary/90"
              >
                <span>Ir a la Galería</span>
                <ArrowRight size={13} />
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Tarjeta de Ganador Empírico Recomendado */}
              {ganadorComparador && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-emerald-500 p-2.5 text-black shadow-md">
                      <Award size={20} />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                        Ganador Científico Recomendado
                      </span>
                      <h4 className="text-sm font-bold text-white">
                        {ganadorComparador.headline || 'Creativo Ganador'} ({ganadorComparador.service})
                      </h4>
                      <p className="text-xs text-neutral-300 mt-0.5">
                        {ganadorComparador.cost_per_customer
                          ? `Menor costo por cliente pagador: R$ ${Number(ganadorComparador.cost_per_customer).toFixed(2)}`
                          : 'Mejor tasa de conversación a clientes'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onAskAssistant(
                        `El creativo "${ganadorComparador.headline}" resultó ganador en el comparador científico para ${ganadorComparador.service}. Diseña la siguiente variante iterando únicamente sobre su hook para abaratar aún más el costo por cliente.`
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-black hover:bg-emerald-400 transition-colors shadow-md"
                  >
                    <span>Crear siguiente variante del ganador</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              )}

              {/* Matriz Comparativa Lado a Lado */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {creativosComparados.map((c, idx) => {
                  const letraVariante = ['A (Control)', 'Variante B', 'Variante C', 'Variante D'][idx] || `Variante ${idx + 1}`;
                  const esGanador = ganadorComparador?.id === c.id;

                  return (
                    <div
                      key={c.id}
                      className={`rounded-xl border p-4 space-y-4 flex flex-col justify-between transition-all ${
                        esGanador
                          ? 'border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/50'
                          : 'border-chrome-border bg-chrome-bg-raised'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className={`rounded px-2 py-0.5 text-xs font-bold ${
                            esGanador ? 'bg-emerald-500 text-black' : 'bg-brand-primary/10 text-brand-primary'
                          }`}>
                            {letraVariante}
                          </span>
                          <span className="text-[10px] text-chrome-text-muted font-mono">
                            {c.format || '1:1'}
                          </span>
                        </div>

                        {/* Thumbnail */}
                        <div className="aspect-video w-full rounded-lg overflow-hidden bg-neutral-900 border border-chrome-border/60">
                          {c.image_url ? (
                            <img
                              src={c.image_url}
                              alt={c.headline}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-chrome-text-muted">
                              Sin imagen
                            </div>
                          )}
                        </div>

                        <div>
                          <h5 className="text-xs font-bold text-chrome-text-active line-clamp-1">
                            {c.headline || 'Sin titular'}
                          </h5>
                          <p className="text-[11px] text-chrome-text-muted line-clamp-2 mt-0.5">
                            {c.primary_text || 'Sin texto principal'}
                          </p>
                        </div>

                        {/* Métricas del Creativo */}
                        <div className="space-y-2 rounded-lg bg-chrome-bg/60 p-2.5 text-xs border border-chrome-border/40">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-chrome-text-muted">Gasto Meta:</span>
                            <span className="font-semibold text-chrome-text">
                              {c.spend != null ? `R$ ${Number(c.spend).toFixed(2)}` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-chrome-text-muted">Conversaciones:</span>
                            <span className="font-semibold text-chrome-text">
                              {c.conversations ?? '—'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-chrome-text-muted">Clientes Pagadores:</span>
                            <span className="font-bold text-emerald-400">
                              {c.paying_customers ?? '0'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[11px] pt-1 border-t border-chrome-border/40">
                            <span className="text-chrome-text-muted font-semibold">Costo / Cliente:</span>
                            <span className={`font-bold ${esGanador ? 'text-emerald-400' : 'text-chrome-text-active'}`}>
                              {c.cost_per_customer != null ? `R$ ${Number(c.cost_per_customer).toFixed(2)}` : '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleSelectCompare(c.id)}
                        className="w-full rounded border border-chrome-border bg-chrome-bg py-1 text-[11px] text-chrome-text hover:bg-chrome-bg-active"
                      >
                        Quitar de comparación
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SECCIÓN 3: GALERÍA Y RANKING DE CREATIVOS ── */}
      {activeSubTab === 'gallery' && (
        <div className="space-y-4">
          {/* Filtros de la Galería */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-chrome-text-muted">Servicio:</span>
              <div className="inline-flex rounded-lg border border-chrome-border bg-chrome-bg-raised p-0.5">
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

            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-chrome-text-muted">Ordenar por:</span>
              <select
                value={sortMetric}
                onChange={(e) => setSortMetric(e.target.value)}
                className="rounded-lg border border-chrome-border bg-chrome-bg-raised px-2.5 py-1 text-xs text-chrome-text focus:border-brand-primary focus:outline-none"
              >
                <option value="costo_por_cliente">Menor Costo por Cliente</option>
                <option value="clientes">Más Clientes Pagadores</option>
                <option value="conversaciones">Más Conversaciones WhatsApp</option>
                <option value="ctr">Mayor CTR (%)</option>
              </select>
            </div>
          </div>

          {creativosFiltrados.length === 0 ? (
            <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-10 text-center space-y-2">
              <p className="text-xs text-chrome-text-muted">
                No hay creativos registrados para el servicio seleccionado.
              </p>
              <button
                type="button"
                onClick={() => setActiveSubTab('creator')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
              >
                <Plus size={13} />
                <span>Crear el primer creativo en el Estudio</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {creativosFiltrados.map((c) => {
                const isSelected = selectedCompareIds.includes(c.id);

                return (
                  <div
                    key={c.id}
                    className={`rounded-xl border p-4 space-y-3 flex flex-col justify-between transition-all ${
                      isSelected
                        ? 'border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary'
                        : 'border-chrome-border bg-chrome-bg-raised'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Cabecera con selector para comparar */}
                      <div className="flex items-center justify-between">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectCompare(c.id)}
                            className="rounded border-chrome-border text-brand-primary focus:ring-0"
                          />
                          <span className="text-[11px] font-medium text-chrome-text">Comparar</span>
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="rounded bg-brand-primary/10 px-2 py-0.5 text-[10px] font-semibold text-brand-primary">
                            {c.service}
                          </span>
                          <span className="rounded bg-chrome-bg px-1.5 py-0.5 text-[10px] font-mono text-chrome-text-muted">
                            {c.format || '1:1'}
                          </span>
                        </div>
                      </div>

                      {/* Imagen Preview */}
                      <div className="aspect-video w-full rounded-lg overflow-hidden bg-neutral-900 border border-chrome-border/60 relative">
                        {c.image_url ? (
                          <img
                            src={c.image_url}
                            alt={c.headline}
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-chrome-text-muted">
                            Sin imagen
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-mono text-white">
                          {c.visual_concept || 'concepto'}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-chrome-text-active line-clamp-1">
                          {c.headline || 'Sin título'}
                        </h4>
                        <p className="text-[11px] text-chrome-text-muted line-clamp-2 mt-0.5">
                          {c.primary_text || c.prompt_text}
                        </p>
                      </div>

                      {/* Tarjetas de Métricas de Negocio */}
                      <div className="grid grid-cols-2 gap-2 text-xs rounded-lg bg-chrome-bg/60 p-2.5 border border-chrome-border/40">
                        <div>
                          <span className="text-[10px] text-chrome-text-muted block">Conversaciones</span>
                          <span className="font-semibold text-chrome-text">
                            {c.conversations ?? '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-chrome-text-muted block">Clientes Pagadores</span>
                          <span className="font-bold text-emerald-400">
                            {c.paying_customers ?? '0'}
                          </span>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-chrome-border/40 flex justify-between items-center">
                          <span className="text-[10px] text-chrome-text-muted">Costo por Cliente:</span>
                          <span className="font-bold text-chrome-text-active">
                            {c.cost_per_customer != null ? `R$ ${Number(c.cost_per_customer).toFixed(2)}` : 'Sin datos de pago'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onAskAssistant(
                          `Analiza el desempeño de este creativo de ${c.service}: "${c.headline}". ¿Qué variaciones podemos probar para reducir su costo por cliente?`
                        )
                      }
                      className="w-full flex items-center justify-center gap-1 rounded-lg border border-brand-primary/30 bg-brand-primary/5 py-1.5 text-[11px] font-semibold text-brand-primary hover:bg-brand-primary/15 transition-colors"
                    >
                      <Sparkles size={12} />
                      <span>Analizar con Asistente</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
