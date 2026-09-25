import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  FolderOpen,
  History,
  Image as ImageIcon,
  MessageSquare,
  Paperclip,
  Pencil,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';
import { useAssistant } from '@features/assistant/context/AssistantContext';
import ClientRelations from './ClientRelations';
import TramiteParticipants from './TramiteParticipants';
import { useAuth } from '@features/auth/context/AuthContext';
import {
  getClientDetail,
  updateClient,
  saveFieldValue,
  updateTramite,
  reviewDocument,
  getAttachmentUrl,
  DRIVE_PREVIEW_URL,
  getDocumentPreviewUrl,
  getDocumentTypes,
  uploadManualDocument,
  PARTICIPANT_ROLES,
} from '../services/clientDetailService';
import { CLIENT_STATUS, TRAMITE_STATUS, KOMMO_CONTACT_URL, KOMMO_LEAD_URL } from '../services/clientsService';

const TONES = {
  sky: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  green: 'bg-green-500/15 text-green-400 border-green-500/30',
  zinc: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  red: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const DOC_STATUS = {
  pending: { label: 'Pendiente', tone: 'zinc' },
  received: { label: 'Por revisar', tone: 'amber' },
  approved: { label: 'Aprobado', tone: 'green' },
  rejected: { label: 'Rechazado', tone: 'red' },
  expired: { label: 'Vencido', tone: 'red' },
};

const PAYMENT_STATUS = {
  pending: { label: 'Pendiente', tone: 'amber' },
  partial: { label: 'Parcial', tone: 'amber' },
  paid: { label: 'Pagado', tone: 'green' },
  overdue: { label: 'Vencido', tone: 'red' },
  cancelled: { label: 'Cancelado', tone: 'zinc' },
};

const SENDER = {
  client: 'Cliente',
  agent: 'Atendente',
  ai: 'Bot',
  system: 'Sistema',
};

const EVENT_LABEL = {
  stage_changed: 'Cambio de etapa',
  document_received: 'Documento recibido',
  document_rejected: 'Documento rechazado',
  data_saved: 'Datos guardados',
  updated: 'Datos actualizados',
  created_from_kommo: 'Trámite creado desde Kommo',
};

const money = (v, currency = 'BRL') => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(Number(v || 0));
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('es', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const dateOnly = (iso) => (iso ? new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const displayName = (c) => (c.full_name && c.full_name !== c.phone ? c.full_name : 'Sin nombre');

function formatPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : phone || '—';
}

function Pill({ tone = 'zinc', children }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>{children}</span>;
}

function Section({ icon: Icon, title, count, action, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-chrome-border bg-chrome-bg">
      <header className="flex items-center gap-2 px-4 py-3">
        <button onClick={() => setOpen(o => !o)} className="flex flex-1 items-center gap-2 text-left">
          {open ? <ChevronDown size={15} className="text-chrome-text-muted" /> : <ChevronRight size={15} className="text-chrome-text-muted" />}
          <Icon size={15} className="text-chrome-text-muted" />
          <h2 className="text-sm font-semibold text-chrome-text-active">{title}</h2>
          {count !== undefined && <span className="text-xs text-chrome-text-muted">{count}</span>}
        </button>
        {action}
      </header>
      {open && <div className="border-t border-chrome-border p-4">{children}</div>}
    </section>
  );
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(String(value)); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="rounded p-1 text-chrome-text-muted opacity-0 transition-opacity hover:text-chrome-text-active group-hover:opacity-100"
      title="Copiar"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

// Campo editable en línea: clic para editar, Enter o salir del campo guarda, Esc cancela.
function EditableRow({ label, value, type = 'text', options, onSave, readOnly }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (!editing) setDraft(value ?? ''); }, [value, editing]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = async () => {
    if (draft === (value ?? '')) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft === '' ? null : draft);
      setEditing(false);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && type !== 'textarea') commit();
    if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); }
  };

  return (
    <div className="group grid grid-cols-[140px_1fr] items-start gap-3 py-1.5 text-sm">
      <span className="pt-0.5 text-chrome-text-muted">{label}</span>
      {editing ? (
        options ? (
          <select ref={inputRef} value={draft} disabled={saving} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={onKeyDown}
            className="rounded-md border border-chrome-border bg-chrome-bg-raised px-2 py-1 text-chrome-text-active">
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : type === 'textarea' ? (
          <textarea ref={inputRef} rows={3} value={draft} disabled={saving} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={onKeyDown}
            className="rounded-md border border-chrome-border bg-chrome-bg-raised px-2 py-1 text-chrome-text-active" />
        ) : (
          <input ref={inputRef} type={type} value={draft} disabled={saving} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={onKeyDown}
            className="rounded-md border border-chrome-border bg-chrome-bg-raised px-2 py-1 text-chrome-text-active" />
        )
      ) : (
        <div className="flex min-w-0 items-start gap-1">
          <span
            onClick={() => !readOnly && setEditing(true)}
            className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${value ? 'text-chrome-text-active' : 'text-chrome-text-muted italic'} ${readOnly ? '' : 'cursor-text rounded hover:bg-chrome-bg-raised'}`}
          >
            {options ? (options.find(o => o.value === value)?.label ?? (value || 'Sin dato')) : (value || 'Sin dato')}
          </span>
          <CopyButton value={value} />
          {!readOnly && <Pencil size={12} className="mt-1 shrink-0 text-chrome-text-muted opacity-0 group-hover:opacity-100" />}
        </div>
      )}
    </div>
  );
}

function DocumentViewer({ doc, onClose }) {
  const drivePreview = DRIVE_PREVIEW_URL(doc.storage_path);
  const [fileUrl, setFileUrl] = useState(null);
  useEffect(() => {
    if (drivePreview) return;
    getDocumentPreviewUrl(doc.storage_path).then(setFileUrl).catch(() => setFileUrl(null));
  }, [doc.storage_path, drivePreview]);
  const isPdf = /pdf/.test(doc.mime_type || '') || /\.pdf$/i.test(doc.file_name || '');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-chrome-border bg-chrome-bg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-chrome-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-chrome-text-active">{doc.document_types?.description || doc.document_types?.name || doc.file_name}</p>
            <p className="truncate text-xs text-chrome-text-muted">{doc.file_name}</p>
          </div>
          <div className="flex items-center gap-2">
            {drivePreview && /^https?:/.test(doc.storage_path) && (
              <a href={doc.storage_path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active">
                Abrir en Drive <ExternalLink size={12} />
              </a>
            )}
            {!drivePreview && fileUrl && (
              <a href={fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active">
                Abrir <ExternalLink size={12} />
              </a>
            )}
            <button onClick={onClose} className="rounded-md p-1.5 text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active"><X size={18} /></button>
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 bg-black">
            {drivePreview ? (
              <iframe title="Documento" src={drivePreview} className="h-full w-full" allow="autoplay" />
            ) : fileUrl && isPdf ? (
              <iframe title="Documento" src={fileUrl} className="h-full w-full" />
            ) : fileUrl ? (
              <img src={fileUrl} alt={doc.file_name} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-chrome-text-muted">No hay vista previa disponible para este archivo.</div>
            )}
          </div>
          {Object.keys(doc.extracted_data || {}).length > 0 && (
            <aside className="w-72 shrink-0 overflow-y-auto border-l border-chrome-border p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-chrome-text-muted">Datos extraídos por la IA</p>
              {Object.entries(doc.extracted_data).map(([k, v]) => (
                <div key={k} className="mb-2 text-sm">
                  <p className="text-xs text-chrome-text-muted">{k.replace(/_/g, ' ')}</p>
                  <p className="text-chrome-text-active">{String(v)}</p>
                </div>
              ))}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function Attachment({ attachment }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { getAttachmentUrl(attachment).then(setUrl).catch(() => setUrl(null)); }, [attachment]);
  const isImage = /image/.test(attachment.mime_type || '') || /picture|image|photo/.test(attachment.kind || '');
  if (isImage && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-1 block">
        <img src={url} alt={attachment.file_name || 'imagen'} className="max-h-48 rounded-md border border-chrome-border object-cover" loading="lazy" />
      </a>
    );
  }
  return (
    <a href={url || undefined} target="_blank" rel="noreferrer" className={`mt-1 inline-flex items-center gap-1 text-xs ${url ? 'text-sky-400 hover:underline' : 'text-chrome-text-muted'}`}>
      {isImage ? <ImageIcon size={12} /> : <Paperclip size={12} />} {attachment.file_name || 'Archivo adjunto'}
    </a>
  );
}

function Conversation({ messages, truncated }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  if (messages.length === 0) {
    return <p className="text-sm text-chrome-text-muted">Todavía no hay mensajes guardados de este cliente. Desde que se activa el receptor de Kommo, cada mensaje entrante y saliente queda acá.</p>;
  }

  let lastDay = null;
  return (
    <div className="flex flex-col gap-2">
      {truncated && <p className="text-center text-xs text-chrome-text-muted">Mostrando los últimos {messages.length} mensajes.</p>}
      {messages.map(m => {
        const day = new Date(m.created_at).toDateString();
        const showDay = day !== lastDay;
        lastDay = day;
        const inbound = m.direction === 'inbound';
        return (
          <React.Fragment key={m.id}>
            {showDay && <p className="my-2 text-center text-[11px] uppercase tracking-wide text-chrome-text-muted">{dateOnly(m.created_at)}</p>}
            <div className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${inbound ? 'bg-chrome-bg-raised text-chrome-text-active' : 'bg-brand-primary text-white'}`}>
                {!inbound && (
                  <p className="mb-0.5 flex items-center gap-1 text-[11px] opacity-80">
                    {m.sender_type === 'ai' ? <Bot size={11} /> : <User size={11} />} {m.author_name || SENDER[m.sender_type] || 'Equipo'}
                  </p>
                )}
                {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                {(m.message_attachments || []).map(a => <Attachment key={a.id} attachment={a} />)}
                <p className={`mt-1 text-right text-[10px] ${inbound ? 'text-chrome-text-muted' : 'opacity-70'}`}>
                  {new Date(m.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </React.Fragment>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

// Subida manual: para cuando un documento no llega por Kommo (ej. lo trae el
// operador de otra fuente, como una carpeta de Drive cargada a mano).
function UploadDocumentForm({ clientId, tramites, organizationId, onUploaded, onCancel }) {
  const [tramiteId, setTramiteId] = useState(tramites[0]?.id || '');
  const [tipoId, setTipoId] = useState('');
  const [tipos, setTipos] = useState([]);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getDocumentTypes().then(setTipos).catch(() => setTipos([])); }, []);

  const guardar = async () => {
    if (!file || !tramiteId || !tipoId) { toast.error('Elige trámite, tipo de documento y archivo.'); return; }
    setSaving(true);
    try {
      await uploadManualDocument(organizationId, clientId, tramiteId, tipoId, file);
      toast.success('Documento subido');
      onUploaded();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo subir el documento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-chrome-border bg-chrome-bg-raised p-3">
      <select value={tramiteId} onChange={e => setTramiteId(e.target.value)} className="rounded-md border border-chrome-border bg-chrome-bg px-2 py-1.5 text-xs text-chrome-text-active">
        {tramites.map(t => <option key={t.id} value={t.id}>{t.servicio}{!t.esTitular ? ` (${t.titular?.full_name})` : ''}</option>)}
      </select>
      <select value={tipoId} onChange={e => setTipoId(e.target.value)} className="rounded-md border border-chrome-border bg-chrome-bg px-2 py-1.5 text-xs text-chrome-text-active">
        <option value="">Tipo de documento…</option>
        {tipos.map(t => <option key={t.id} value={t.id}>{t.description || t.name}</option>)}
      </select>
      <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="max-w-[220px] text-xs text-chrome-text-muted file:mr-2 file:rounded-md file:border-0 file:bg-chrome-bg file:px-2 file:py-1 file:text-xs file:text-chrome-text-active" />
      <button onClick={guardar} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-chrome-accent px-2.5 py-1.5 text-xs font-medium text-white hover:bg-chrome-accent-hover disabled:opacity-50">
        <Upload size={13} /> Subir
      </button>
      <button onClick={onCancel} className="rounded-md px-2.5 py-1.5 text-xs text-chrome-text-muted hover:bg-chrome-bg">Cancelar</button>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 p-4 animate-pulse">
      <div className="h-24 rounded-xl border border-chrome-border bg-chrome-bg" />
      <div className="flex flex-1 gap-4">
        {[1, 2, 3].map(i => <div key={i} className="flex-1 rounded-xl border border-chrome-border bg-chrome-bg" />)}
      </div>
    </div>
  );
}

/**
 * Ficha del cliente — todo en una pantalla: datos, trámites (uno por lead de
 * Kommo) con sus etapas y campos, documentos, pagos, historial y la
 * conversación completa de Kommo.
 */
export default function ClientDetailView({ clientId, onBack, onNavigateToClient }) {
  const { userId, userProfile } = useAuth();
  const assistant = useAssistant();
  const queryClient = useQueryClient();
  const queryKey = ['client_detail', clientId];
  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => getClientDetail(clientId), enabled: !!clientId });
  const [viewing, setViewing] = useState(null);
  const [docFilter, setDocFilter] = useState('all');
  const [uploading, setUploading] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ['painel_clientes'] });
  };

  const consolidated = useMemo(() => {
    // Primer valor no vacío de cada dato entre todos los trámites (filiación, dirección…).
    const out = new Map();
    (data?.tramites || []).forEach(t => t.fields.forEach(f => {
      if (f.value && !out.has(f.name)) out.set(f.name, { label: f.label, value: f.value, servicio: t.servicio });
    }));
    return [...out.values()];
  }, [data]);

  if (isLoading) return <DetailSkeleton />;
  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-chrome-text-muted">
        <AlertCircle size={40} className="text-red-500" />
        <p>{error ? 'No se pudieron cargar los datos del cliente.' : 'Cliente no encontrado.'}</p>
        <button onClick={onBack} className="text-sm text-sky-400 hover:underline">Volver a Clientes</button>
      </div>
    );
  }

  const { client, relaciones, tramites, documents, payments, events, messages, messagesTruncated } = data;
  const status = CLIENT_STATUS[client.status] || CLIENT_STATUS.lead;
  const saveClient = (field) => async (value) => { await updateClient(client.id, { [field]: value }); refresh(); };

  const onReview = async (doc, approved) => {
    let notes = null;
    if (!approved) {
      notes = window.prompt('Motivo del rechazo (el agente se lo explicará al cliente):');
      if (notes === null) return;
    }
    try {
      await reviewDocument(doc.id, approved, userId, notes || null);
      toast.success(approved ? 'Documento aprobado' : 'Documento rechazado');
      refresh();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo guardar.');
    }
  };

  const onTramiteChange = async (tramite, patch) => {
    try {
      await updateTramite(tramite.id, patch);
      toast.success(patch.stage_id ? 'Etapa actualizada (se refleja en Kommo)' : 'Trámite actualizado');
      refresh();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo actualizar el trámite.');
    }
  };

  const visibleDocs = documents.filter(d => docFilter === 'all' || d.status === docFilter);
  const paidTotal = payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-4">
      {/* Encabezado */}
      <header className="flex flex-wrap items-center gap-4 rounded-xl border border-chrome-border bg-chrome-bg px-4 py-3">
        <button onClick={onBack} className="rounded-md p-1.5 text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active" title="Volver a Clientes">
          <ArrowLeft size={18} />
        </button>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-primary text-sm font-semibold text-white">
          {displayName(client) === 'Sin nombre' ? <User size={18} /> : displayName(client).substring(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-chrome-text-active">{displayName(client)}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-chrome-text-muted">
            <Pill tone={status.tone}>{status.label}</Pill>
            <span>{formatPhone(client.phone)}</span>
            {client.email && <span>· {client.email}</span>}
            {client.nationality && <span>· {client.nationality}</span>}
            <span>· cliente desde {dateOnly(client.created_at)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md border border-chrome-border px-2.5 py-1.5 text-chrome-text">{tramites.length} trámite(s)</span>
          <span className="rounded-md border border-chrome-border px-2.5 py-1.5 text-chrome-text">{money(paidTotal)} pagado</span>
          <button
            onClick={() => assistant.setOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-brand-primary/60 px-3 py-1.5 font-medium text-chrome-text-active hover:bg-brand-primary/20"
            title="Resumir, extraer datos, redactar mensajes…"
          >
            <Bot size={13} /> Asistente
          </button>
          {client.kommo_contact_id && (
            <a href={KOMMO_CONTACT_URL(client.kommo_contact_id)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-chrome-accent px-3 py-1.5 font-medium text-white hover:bg-chrome-accent-hover">
              Abrir en Kommo <ExternalLink size={12} />
            </a>
          )}
        </div>
      </header>

      {/* Columnas */}
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-1">
        {/* Columna 1: datos + historial */}
        <div className="flex min-w-[360px] flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <Section icon={User} title="Datos personales">
            <EditableRow label="Nombre completo" value={client.full_name === client.phone ? '' : client.full_name} onSave={v => saveClient('full_name')(v || client.phone)} />
            <EditableRow label="Nombre preferido" value={client.preferred_name} onSave={saveClient('preferred_name')} />
            <EditableRow label="Teléfono" value={client.phone} readOnly />
            <EditableRow label="Email" type="email" value={client.email} onSave={saveClient('email')} />
            <EditableRow label="Nacionalidad" value={client.nationality} onSave={saveClient('nationality')} />
            <EditableRow label="País" value={client.country} onSave={saveClient('country')} />
            <EditableRow label="Fecha de nacimiento" type="date" value={client.birth_date} onSave={saveClient('birth_date')} />
            <EditableRow
              label="Estado"
              value={client.status}
              options={Object.entries(CLIENT_STATUS).map(([value, s]) => ({ value, label: s.label }))}
              onSave={saveClient('status')}
            />
            <EditableRow label="Origen" value={client.lead_source} readOnly />
          </Section>

          <Section icon={Users} title="Relaciones" count={relaciones.length}>
            <ClientRelations
              client={client}
              relaciones={relaciones}
              organizationId={userProfile.organization_id}
              onChanged={refresh}
              onNavigateToClient={onNavigateToClient}
            />
          </Section>

          {consolidated.length > 0 && (
            <Section icon={FileText} title="Datos de los trámites" count={consolidated.length}>
              <p className="mb-2 text-xs text-chrome-text-muted">Datos cargados por el cliente o extraídos de sus documentos. Se editan dentro de cada trámite.</p>
              {consolidated.map(d => <EditableRow key={d.label} label={d.label} value={d.value} readOnly />)}
            </Section>
          )}

          <Section icon={History} title="Historial" count={events.length} defaultOpen={false}>
            {events.length === 0 ? (
              <p className="text-sm text-chrome-text-muted">Sin movimientos todavía.</p>
            ) : (
              <ol className="space-y-2">
                {events.map(e => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <Clock size={13} className="mt-1 shrink-0 text-chrome-text-muted" />
                    <div className="min-w-0">
                      <p className="text-chrome-text-active">
                        {EVENT_LABEL[e.event_type] || e.event_type}
                        {e.event_type === 'stage_changed' && `: ${e.from || '—'} → ${e.to || '—'}`}
                        {e.metadata?.tipo_documento && `: ${e.metadata.tipo_documento}`}
                        {e.metadata?.document_type && `: ${e.metadata.document_type}`}
                      </p>
                      <p className="text-xs text-chrome-text-muted">
                        {dateTime(e.created_at)} · {tramites.find(t => t.id === e.client_service_id)?.servicio}
                        {e.metadata?.problemas && ` · ${e.metadata.problemas}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        {/* Columna 2: trámites, documentos, pagos */}
        <div className="flex min-w-[400px] flex-[1.3] flex-col gap-4 overflow-y-auto pr-1">
          <Section icon={FolderOpen} title="Trámites" count={tramites.length}>
            {tramites.length === 0 ? (
              <p className="text-sm text-chrome-text-muted">Sin trámites. Se crean solos cuando un lead de este contacto entra al pipeline Operacional en Kommo.</p>
            ) : (
              <div className="space-y-4">
                {tramites.map(t => {
                  const ts = TRAMITE_STATUS[t.status] || TRAMITE_STATUS.pending;
                  return (
                    <div key={t.id} className="rounded-lg border border-chrome-border bg-chrome-bg-raised p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-chrome-text-active">
                            {t.servicio}
                            {!t.esTitular && (
                              <span className="ml-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-400">
                                {PARTICIPANT_ROLES[t.rol] || 'Participa'} · titular: {t.titular?.full_name}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-chrome-text-muted">Iniciado {dateOnly(t.started_at || t.created_at)} · actualizado {dateTime(t.updated_at)}</p>
                        </div>
                        <Pill tone={ts.tone}>{ts.label}</Pill>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className="text-xs text-chrome-text-muted">
                          Etapa
                          <select
                            value={t.stage_id || ''}
                            onChange={e => onTramiteChange(t, { stage_id: e.target.value || null })}
                            className="mt-1 w-full rounded-md border border-chrome-border bg-chrome-bg px-2 py-1.5 text-sm text-chrome-text-active"
                          >
                            <option value="">Sin etapa</option>
                            {t.stages.map(s => <option key={s.id} value={s.id}>{s.name.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())}</option>)}
                          </select>
                        </label>
                        <label className="text-xs text-chrome-text-muted">
                          Estado
                          <select
                            value={t.status}
                            onChange={e => onTramiteChange(t, { status: e.target.value, completed_at: e.target.value === 'completed' ? new Date().toISOString() : null })}
                            className="mt-1 w-full rounded-md border border-chrome-border bg-chrome-bg px-2 py-1.5 text-sm text-chrome-text-active"
                          >
                            {Object.entries(TRAMITE_STATUS).map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
                          </select>
                        </label>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        {t.kommo_lead_id && (
                          <a href={KOMMO_LEAD_URL(t.kommo_lead_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-400 hover:underline">
                            Lead en Kommo <ExternalLink size={11} />
                          </a>
                        )}
                        {t.driveLink && (
                          <a href={t.driveLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-400 hover:underline">
                            <FolderOpen size={12} /> Carpeta en Drive
                          </a>
                        )}
                        {t.price != null && <span className="text-chrome-text-muted">Valor: {money(t.price, t.currency)}</span>}
                      </div>

                      {t.fields.length > 0 && (
                        <div className="mt-3 border-t border-chrome-border pt-2">
                          {t.fields.map(f => (
                            <EditableRow
                              key={f.id}
                              label={f.label}
                              value={f.value}
                              type={f.field_type === 'textarea' ? 'textarea' : f.field_type === 'date' ? 'date' : 'text'}
                              onSave={async v => { await saveFieldValue(userProfile.organization_id, t.id, f.id, v ?? ''); refresh(); }}
                            />
                          ))}
                        </div>
                      )}

                      <TramiteParticipants
                        tramite={t}
                        relaciones={relaciones}
                        organizationId={userProfile.organization_id}
                        onChanged={refresh}
                        onNavigateToClient={onNavigateToClient}
                      />

                      {t.notes && <p className="mt-2 whitespace-pre-wrap rounded-md bg-chrome-bg px-2 py-1.5 text-xs text-chrome-text-muted">{t.notes}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section
            icon={FileText}
            title="Documentos"
            count={documents.length}
            action={
              <div className="flex items-center gap-2">
                <select value={docFilter} onChange={e => setDocFilter(e.target.value)} className="rounded-md border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text-active">
                  <option value="all">Todos</option>
                  {Object.entries(DOC_STATUS).map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
                </select>
                {tramites.length > 0 && (
                  <button
                    onClick={() => setUploading(u => !u)}
                    className="inline-flex items-center gap-1 rounded-md border border-chrome-border px-2 py-1 text-xs text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active"
                    title="Subir un documento a mano"
                  >
                    <Upload size={12} /> Subir
                  </button>
                )}
              </div>
            }
          >
            {uploading && (
              <UploadDocumentForm
                clientId={client.id}
                tramites={tramites}
                organizationId={userProfile.organization_id}
                onUploaded={() => { setUploading(false); refresh(); }}
                onCancel={() => setUploading(false)}
              />
            )}
            {visibleDocs.length === 0 ? (
              <p className="text-sm text-chrome-text-muted">No hay documentos{docFilter !== 'all' ? ' con ese estado' : ''}. El agente de recepción los guarda acá cuando el cliente los manda por Kommo.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {visibleDocs.map(d => {
                  const ds = DOC_STATUS[d.status] || DOC_STATUS.pending;
                  return (
                    <div key={d.id} className="rounded-lg border border-chrome-border bg-chrome-bg-raised p-3">
                      <button onClick={() => setViewing(d)} className="flex w-full items-start gap-2 text-left">
                        <FileText size={16} className="mt-0.5 shrink-0 text-chrome-text-muted" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-chrome-text-active">{d.document_types?.description || d.document_types?.name || 'Documento'}</p>
                          <p className="truncate text-xs text-chrome-text-muted">{d.file_name} · {dateTime(d.created_at)}</p>
                        </div>
                        <Pill tone={ds.tone}>{ds.label}</Pill>
                      </button>
                      {(d.quality_notes || d.review_notes) && (
                        <p className="mt-2 text-xs text-amber-400">{d.review_notes || d.quality_notes}</p>
                      )}
                      {d.status === 'received' && (
                        <div className="mt-2 flex gap-1">
                          <button onClick={() => onReview(d, true)} className="inline-flex items-center gap-1 rounded-md bg-chrome-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-chrome-accent-hover">
                            <Check size={13} /> Aprobar
                          </button>
                          <button onClick={() => onReview(d, false)} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10">
                            <X size={13} /> Rechazar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section icon={CreditCard} title="Pagos" count={payments.length} defaultOpen={payments.length > 0}>
            {payments.length === 0 ? (
              <p className="text-sm text-chrome-text-muted">Sin pagos registrados. Se registran solos al confirmar el PIX y pasar el lead a Operacional.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {payments.map(p => {
                    const ps = PAYMENT_STATUS[p.status] || PAYMENT_STATUS.pending;
                    return (
                      <tr key={p.id} className="border-b border-chrome-border last:border-0">
                        <td className="py-2 text-chrome-text-active">{money(p.amount, p.currency)}</td>
                        <td className="py-2 text-chrome-text-muted">{tramites.find(t => t.id === p.client_service_id)?.servicio || '—'}</td>
                        <td className="py-2 uppercase text-chrome-text-muted">{p.payment_method || '—'}</td>
                        <td className="py-2 text-chrome-text-muted">{dateOnly(p.paid_at || p.created_at)}</td>
                        <td className="py-2 text-right"><Pill tone={ps.tone}>{ps.label}</Pill></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        {/* Columna 3: conversación de Kommo */}
        <div className="flex min-w-[360px] flex-1 flex-col overflow-hidden">
          <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-chrome-border bg-chrome-bg">
            <header className="flex items-center gap-2 border-b border-chrome-border px-4 py-3">
              <MessageSquare size={15} className="text-chrome-text-muted" />
              <h2 className="text-sm font-semibold text-chrome-text-active">Conversación (Kommo)</h2>
              <span className="text-xs text-chrome-text-muted">{messages.length}</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <Conversation messages={messages} truncated={messagesTruncated} />
            </div>
            {client.kommo_contact_id && (
              <div className="border-t border-chrome-border px-4 py-2 text-xs text-chrome-text-muted">
                Para responder, usa Kommo: es el único canal de atención.
              </div>
            )}
          </section>
        </div>
      </div>

      {viewing && <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
