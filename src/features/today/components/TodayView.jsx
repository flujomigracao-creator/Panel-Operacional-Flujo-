import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSearch,
  Hourglass,
  Landmark,
  Banknote,
  Mail,
  MapPin,
  ListTodo,
  MessageSquare,
  RefreshCw,
  X,
} from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import {
  getPendentesHoje,
  completeTask,
  dismissTask,
  snoozeTask,
  reviewDocument,
  guardarDireccionTramite,
  KOMMO_LEAD_URL,
} from '../services/todayService';

const REFRESH_MS = 60_000;

const PRIORITY_META = {
  urgent: { label: 'Urgente', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  high: { label: 'Alta', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  normal: { label: 'Normal', className: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  low: { label: 'Baja', className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
};

const TYPE_META = {
  revisar_documento: { label: 'Documento', icon: FileSearch },
  caso_parado: { label: 'Caso parado', icon: Hourglass },
  agendamento: { label: 'Cita', icon: CalendarClock },
  erro_automacao: { label: 'Error de automatización', icon: AlertTriangle },
  assinatura: { label: 'Firma', icon: ListTodo },
  inscricao_receita: { label: 'Inscripción en la Receita', icon: Landmark },
  enviar_email: { label: 'Correo listo', icon: Mail },
  falta_direccion: { label: 'Falta dirección', icon: MapPin },
  pago_picpay_recibido: { label: 'Pago recibido (PicPay)', icon: Banknote },
};

// Inscripción CPF: la extensión FLUJO abre esta página y la llena con el caso del #flujo.
const RECEITA_CPF_URL = 'https://servicos.receita.fazenda.gov.br/Servicos/CPF/InscricaoCpfEstrangeiro/default.asp';
const GMAIL_DRAFTS_URL = 'https://mail.google.com/mail/u/0/#drafts';
const EXTENSION_ZIP = '/extension-flujo-cpf.zip';
// Tareas que se cierran solas cuando el sistema detecta que se hicieron: cerrarlas a mano
// haría que se volvieran a crear.
const AUTO_CLOSE = new Set(['inscricao_receita']);

const FILTERS = [
  { key: 'all', label: 'Todo' },
  { key: 'urgent', label: 'Urgente' },
  { key: 'tarefa', label: 'Tareas' },
  { key: 'sinal', label: 'Detectado' },
];

function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 60) return `hace ${Math.max(mins, 1)} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

function dueLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const overdue = d < new Date();
  const text = d.toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return { text: overdue ? `Venció ${text}` : `Vence ${text}`, overdue };
}

function TodaySkeleton() {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-chrome-bg-subtle p-6 lg:p-8 animate-pulse">
      <div className="mb-8">
        <div className="h-7 w-40 rounded-md bg-chrome-bg-raised" />
        <div className="h-4 w-72 rounded-md bg-chrome-bg-raised mt-2" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-chrome-border bg-chrome-bg" />
        ))}
      </div>
    </div>
  );
}

function ActionButton({ onClick, title, children, variant = 'ghost', disabled }) {
  const base = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50';
  const styles = {
    primary: 'bg-chrome-accent text-white hover:bg-chrome-accent-hover',
    ghost: 'text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active',
    danger: 'text-red-400 hover:bg-red-500/10',
  };
  return (
    <button onClick={onClick} title={title} disabled={disabled} className={`${base} ${styles[variant]}`}>
      {children}
    </button>
  );
}

function DireccionForm({ item, organizationId, onSaved }) {
  const [endereco, setEndereco] = useState('');
  const [cidade, setCidade] = useState('');
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!endereco.trim() || !cidade.trim()) {
      toast.error('Completa dirección y ciudad');
      return;
    }
    setSaving(true);
    try {
      await guardarDireccionTramite(organizationId, item.client_service_id, endereco, cidade);
      toast.success('Dirección guardada');
      onSaved(item);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo guardar la dirección');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        value={endereco}
        onChange={(e) => setEndereco(e.target.value)}
        placeholder="Rua, número, bairro, CEP"
        className="min-w-[220px] flex-1 rounded-md border border-chrome-border bg-chrome-bg-subtle px-2.5 py-1.5 text-xs text-chrome-text placeholder:text-chrome-text-muted"
      />
      <input
        value={cidade}
        onChange={(e) => setCidade(e.target.value)}
        placeholder="Ciudad / estado"
        className="w-40 rounded-md border border-chrome-border bg-chrome-bg-subtle px-2.5 py-1.5 text-xs text-chrome-text placeholder:text-chrome-text-muted"
      />
      <ActionButton variant="primary" disabled={saving} onClick={guardar} title="Guardar dirección del trámite">
        <Check size={14} /> Guardar
      </ActionButton>
    </div>
  );
}

function InboxItem({ item, busy, organizationId, onAction, onNavigateToClient, onOpenLead, onDireccionGuardada }) {
  const priority = PRIORITY_META[item.prioridade] || PRIORITY_META.normal;
  const type = TYPE_META[item.tipo] || { label: item.origem === 'tarefa' ? 'Tarea' : item.tipo, icon: ListTodo };
  const Icon = type.icon;
  const due = dueLabel(item.vence_em);

  return (
    <div className="flex items-start gap-4 rounded-xl border border-chrome-border bg-chrome-bg p-4 shadow-sm">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white">
        <Icon size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priority.className}`}>{priority.label}</span>
          <span className="text-[11px] uppercase tracking-wide text-chrome-text-muted">{type.label}</span>
          {due && (
            <span className={`inline-flex items-center gap-1 text-[11px] ${due.overdue ? 'text-red-400' : 'text-chrome-text-muted'}`}>
              <Clock size={11} /> {due.text}
            </span>
          )}
        </div>
        <p className="mt-1 font-medium text-chrome-text">{item.titulo}</p>
        {item.detalhes && <p className="mt-0.5 line-clamp-2 text-sm text-chrome-text-muted">{item.detalhes}</p>}
        <p className="mt-1 text-xs text-chrome-text-muted">{timeAgo(item.desde)}</p>
        {item.tipo === 'falta_direccion' && item.client_service_id && (
          <DireccionForm item={item} organizationId={organizationId} onSaved={onDireccionGuardada} />
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {item.tipo === 'inscricao_receita' && item.client_service_id && (
          <>
            <a
              href={item.enlace || `${RECEITA_CPF_URL}#flujo=${item.client_service_id}`}
              target="_blank"
              rel="noreferrer"
              title="Abre la Receita ya llenada: marca el captcha, envía y guarda el comprovante"
              className="inline-flex items-center gap-1.5 rounded-md bg-chrome-accent px-2.5 py-1.5 text-xs font-medium text-white"
            >
              <Landmark size={14} /> Abrir en la Receita
            </a>
            <a href={EXTENSION_ZIP} download title="Extensión de Chrome que llena el formulario" className="inline-flex items-center rounded-md px-2.5 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg-raised">
              Extensión
            </a>
          </>
        )}
        {item.tipo === 'enviar_email' && (
          <a href={GMAIL_DRAFTS_URL} target="_blank" rel="noreferrer" title="Revisa y envía el borrador" className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-chrome-text hover:bg-chrome-bg-raised">
            <Mail size={14} /> Gmail
          </a>
        )}
        {item.origem === 'tarefa' && !AUTO_CLOSE.has(item.tipo) && (
          <>
            <ActionButton variant="primary" disabled={busy} onClick={() => onAction('complete', item)} title="Marcar como hecha">
              <Check size={14} /> Hecho
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => onAction('snooze', item)} title="Ocultar hasta mañana">
              <Clock size={14} /> Mañana
            </ActionButton>
            <ActionButton variant="danger" disabled={busy} onClick={() => onAction('dismiss', item)} title="Descartar">
              <X size={14} />
            </ActionButton>
          </>
        )}
        {item.tipo === 'revisar_documento' && (
          <>
            <ActionButton variant="primary" disabled={busy} onClick={() => onAction('approve', item)} title="Aprobar documento">
              <Check size={14} /> Aprobar
            </ActionButton>
            <ActionButton variant="danger" disabled={busy} onClick={() => onAction('reject', item)} title="Rechazar: el agente pedirá reenviarlo">
              <X size={14} /> Rechazar
            </ActionButton>
          </>
        )}
        {item.kommo_lead_id && onOpenLead && (
          <ActionButton variant="primary" onClick={() => onOpenLead(item.kommo_lead_id)} title="Ver la conversación, responder y enseñarle a Nora">
            <MessageSquare size={14} /> Responder
          </ActionButton>
        )}
        {item.client_id && onNavigateToClient && (
          <ActionButton onClick={() => onNavigateToClient(item.client_id)} title="Abrir ficha del cliente">
            Ficha
          </ActionButton>
        )}
        {item.kommo_lead_id && (
          <a
            href={KOMMO_LEAD_URL(item.kommo_lead_id)}
            target="_blank"
            rel="noreferrer"
            title="Abrir lead en Kommo"
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active"
          >
            Kommo <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Hoy — todo lo que necesita intervención humana, en un solo lugar.
 * Lo que no aparece acá lo están resolviendo las automatizaciones.
 */
export default function TodayView({ onNavigateToClient, onOpenLead }) {
  const { userId, userProfile } = useAuth();
  const organizationId = userProfile?.organization_id;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      setItems(await getPendentesHoje());
      setError(null);
      setRefreshedAt(new Date());
    } catch (err) {
      console.error(err);
      setError('No se pudieron cargar los pendientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    // El asistente avisa cuando una acción confirmada cambia datos
    window.addEventListener('flujo:data-changed', load);
    return () => { clearInterval(id); window.removeEventListener('flujo:data-changed', load); };
  }, [load]);

  const handleAction = useCallback(async (action, item) => {
    setBusyId(item.ref_id);
    try {
      if (action === 'complete') await completeTask(item.ref_id);
      if (action === 'dismiss') await dismissTask(item.ref_id);
      if (action === 'snooze') await snoozeTask(item.ref_id, 24);
      if (action === 'approve') await reviewDocument(item.ref_id, true, userId);
      if (action === 'reject') {
        const notes = window.prompt('Motivo del rechazo (el agente se lo explicará al cliente):');
        if (notes === null) return;
        await reviewDocument(item.ref_id, false, userId, notes || null);
      }
      setItems(prev => prev.filter(i => !(i.ref_id === item.ref_id && i.tipo === item.tipo)));
      toast.success('Listo');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo guardar. Intenta de nuevo.');
    } finally {
      setBusyId(null);
    }
  }, [userId]);

  const handleDireccionGuardada = useCallback((item) => {
    setItems(prev => prev.filter(i => !(i.ref_id === item.ref_id && i.tipo === item.tipo)));
  }, []);

  const counts = useMemo(() => ({
    all: items.length,
    urgent: items.filter(i => i.prioridade === 'urgent').length,
    tarefa: items.filter(i => i.origem === 'tarefa').length,
    sinal: items.filter(i => i.origem === 'sinal').length,
  }), [items]);

  const visible = useMemo(() => items.filter(i =>
    filter === 'all' ? true : filter === 'urgent' ? i.prioridade === 'urgent' : i.origem === filter
  ), [items, filter]);

  if (loading) return <TodaySkeleton />;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-chrome-bg-subtle p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-chrome-text">Hoy</h1>
          <p className="text-chrome-text-muted mt-1">
            {items.length === 0 ? 'Nada requiere tu atención.' : `${items.length} cosas necesitan tu atención. El resto lo están resolviendo las automatizaciones.`}
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-chrome-text-muted hover:bg-chrome-bg-raised hover:text-chrome-text-active"
          title="Actualizar"
        >
          <RefreshCw size={13} />
          {refreshedAt ? refreshedAt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : 'Actualizar'}
        </button>
      </header>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? 'border-transparent bg-chrome-accent text-white'
                : 'border-chrome-border text-chrome-text hover:bg-chrome-bg-raised'
            }`}
          >
            {f.label} <span className="opacity-70">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-chrome-text-muted">
          <CheckCircle2 size={44} className="text-green-500" />
          <p>Todo al día.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map(item => (
            <InboxItem
              key={`${item.origem}-${item.tipo}-${item.ref_id}`}
              item={item}
              busy={busyId === item.ref_id}
              organizationId={organizationId}
              onAction={handleAction}
              onNavigateToClient={onNavigateToClient}
              onOpenLead={onOpenLead}
              onDireccionGuardada={handleDireccionGuardada}
            />
          ))}
        </div>
      )}
    </div>
  );
}
