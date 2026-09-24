import React, { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronDown, ChevronUp, FileText, Send, Loader2, Trash2, Pencil, Check, X, Wallet, Users } from 'lucide-react';
import { formatDate } from '../utils/dateFormatter';
import { formatCurrency } from '../utils/currencyFormatter';
import { getNotasTramite, createNotaTramite, updateNotaTramite, getPagos, createPago, deletePago, getEtiquetas, updateEntradaEtiquetas, getVinculadosEntrada, vincularClienteATramite, desvincularClienteDeTramite, updateEntradaValor } from '../services/tramitesService';
import { searchClientes } from '../services/clientesService';
import toast from 'react-hot-toast';
import { EmptyState } from './ui/EmptyState';

const TRAMITE_COLORS = {
  entrante: { bg: 'rgba(55,138,221,0.18)', color: '#378ADD' },
  esperando_cliente: { bg: 'rgba(239,68,68,0.18)', color: '#ef4444' }, // rojo
  esperando: { bg: 'rgba(239,68,68,0.18)', color: '#ef4444' }, // rojo
  cobranza: { bg: 'rgba(29,158,117,0.18)', color: '#1D9E75' },
  logrado: { bg: 'rgba(16,185,129,0.18)', color: '#10b981' },
};

const mapLegacyState = (state) => {
  if (!state) return 'entrante';
  const s = state.toLowerCase();
  if (s === 'pendiente') return 'entrante';
  if (s === 'esperando_docs') return 'esperando_cliente';
  if (s === 'procesando') return 'esperando';
  // Map completada directly to logrado, cancelada to cobranza
  if (s === 'completada') return 'logrado';
  if (s === 'cancelada') return 'cobranza';
  return s;
};

const mapStageToLegacy = (stageId) => {
  switch (stageId) {
    case 'entrante': return 'pendiente';
    case 'esperando_cliente': return 'esperando_docs';
    case 'esperando': return 'procesando';
    case 'cobranza': return 'cancelada';
    case 'logrado': return 'completada';
    default: return 'pendiente';
  }
};



const PagosSection = ({ entrada, catalogoTramites, onCostoUpdated }) => {
  const [pagos, setPagos] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(true);
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [editingCosto, setEditingCosto] = useState(false);
  const [costoDraft, setCostoDraft] = useState('');
  const [savingCosto, setSavingCosto] = useState(false);

  useEffect(() => {
    let active = true;
    getPagos(entrada.id)
      .then((data) => { if (active) setPagos(data); })
      .catch((err) => { console.error('[PagosSection] Error loading pagos:', err); if (active) setPagos([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entrada.id]);

  const catTramite = catalogoTramites.find(c => c.nombre?.toUpperCase() === entrada.servicio?.toUpperCase());
  const baseCosto = catTramite?.costo || 0;
  // entrada.valor puede ser legítimamente 0 (descuento total) -- no usar
  // `||` acá, que trataría el 0 como "sin valor" y lo pisaría con baseCosto.
  const costo = entrada.valor != null ? Number(entrada.valor) : baseCosto;
  const pagado = (pagos || []).reduce((sum, p) => sum + (Number(p.monto) || 0), 0);

  // El costo se recalcula solo cuando se vincula/desvincula gente al trámite
  // (costo base × cantidad de personas), pero a veces hace falta un
  // descuento manual -- por eso queda editable acá. Ojo: un vincular/
  // desvincular posterior vuelve a pisar este valor con el cálculo automático.
  const startEditCosto = () => {
    setCostoDraft(String(costo || ''));
    setEditingCosto(true);
  };

  const handleSaveCosto = async () => {
    const nuevoValor = Number(costoDraft);
    if (Number.isNaN(nuevoValor) || nuevoValor < 0) {
      toast.error('Ingresá un monto válido');
      return;
    }
    setSavingCosto(true);
    try {
      await updateEntradaValor(entrada.id, nuevoValor);
      onCostoUpdated && onCostoUpdated(entrada.id, nuevoValor);
      setEditingCosto(false);
      toast.success('Costo actualizado');
    } catch (err) {
      console.error('[PagosSection] Error actualizando costo:', err);
      toast.error('No se pudo actualizar el costo');
    } finally {
      setSavingCosto(false);
    }
  };
  const pendiente = Math.max(costo - pagado, 0);

  const handleAdd = async (e) => {
    e.preventDefault();
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) return;
    setSaving(true);
    try {
      const pago = await createPago({ entrada_id: entrada.id, monto: montoNum, fecha });
      setPagos((prev) => [pago, ...(prev || [])]);
      setMonto('');
      toast.success('Pago registrado');
    } catch (err) {
      console.error('[PagosSection] Error creating pago:', err);
      toast.error('No se pudo registrar el pago');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este pago?')) return;
    try {
      await deletePago(id);
      setPagos((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('[PagosSection] Error deleting pago:', err);
      toast.error('No se pudo eliminar el pago');
    }
  };

  return (
    <div style={{ background: 'var(--color-bg-base)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <Wallet size={14} color="var(--color-text-secondary)" />
        <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Pagos
        </h4>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
        <div onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Costo</div>
          {editingCosto ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <input
                type="number"
                min="0"
                step="0.01"
                autoFocus
                value={costoDraft}
                onChange={(e) => setCostoDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCosto(); if (e.key === 'Escape') setEditingCosto(false); }}
                style={{ width: '5.5rem', padding: '0.15rem 0.3rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-primary)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: '0.85rem' }}
              />
              <button onClick={handleSaveCosto} disabled={savingCosto} style={{ display: 'inline-flex', color: 'var(--color-success)' }} aria-label="Guardar costo">
                {savingCosto ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              </button>
              <button onClick={() => setEditingCosto(false)} style={{ display: 'inline-flex', color: 'var(--color-text-muted)' }} aria-label="Cancelar">
                <X size={13} />
              </button>
            </div>
          ) : (
            <div
              onClick={startEditCosto}
              title="Tocar para editar (ej. aplicar un descuento)"
              style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              {formatCurrency(costo)}
              <Pencil size={10} color="var(--color-text-muted)" />
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Pagado</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-success)' }}>{formatCurrency(pagado)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Pendiente</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: pendiente > 0 ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>{formatCurrency(pendiente)}</div>
        </div>
      </div>

      <form onClick={(e) => e.stopPropagation()} onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Monto"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: '0.8rem' }}
        />
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: '0.8rem' }}
        />
        <button type="submit" disabled={saving || !monto} className="btn btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', opacity: saving || !monto ? 0.6 : 1 }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : 'Registrar'}
        </button>
      </form>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Cargando pagos...</div>
      ) : pagos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>Sin pagos registrados todavía.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {pagos.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.3rem 0' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{formatDate(p.fecha)}</span>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{formatCurrency(p.monto)}</span>
              <button onClick={() => handleDelete(p.id)} style={{ color: 'var(--color-text-muted)', display: 'inline-flex' }} aria-label="Eliminar pago">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Un trámite puede cubrir a más de una persona (ej. un caso de refugio de
// toda una familia). El titular sigue siendo `entrada.id_cliente`; acá se
// administran las personas adicionales vinculadas.
const VinculadosSection = ({ entrada, onPersonasChanged }) => {
  const [vinculados, setVinculados] = useState(null); // null = cargando
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);

  const load = useCallback(() => {
    getVinculadosEntrada(entrada.id)
      .then(setVinculados)
      .catch((err) => { console.error('[VinculadosSection] Error loading:', err); setVinculados([]); });
  }, [entrada.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await searchClientes(query.trim());
        setResults(data.filter(c => c.id !== entrada.id_cliente && !(vinculados || []).some(v => v.cliente_id === c.id)));
      } catch (err) {
        console.error('[VinculadosSection] Error searching:', err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, vinculados, entrada.id_cliente]);

  const handleLink = async (clienteId) => {
    setLinking(true);
    try {
      await vincularClienteATramite(entrada.id, clienteId);
      toast.success('Persona vinculada al trámite — costo actualizado');
      setQuery('');
      setResults([]);
      setShowSearch(false);
      load();
      onPersonasChanged && onPersonasChanged();
    } catch (err) {
      console.error('[VinculadosSection] Error linking:', err);
      toast.error('No se pudo vincular');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (clienteId) => {
    if (!window.confirm('¿Desvincular a esta persona del trámite?')) return;
    try {
      await desvincularClienteDeTramite(entrada.id, clienteId);
      setVinculados((prev) => (prev || []).filter((v) => v.cliente_id !== clienteId));
      toast.success('Persona desvinculada — costo actualizado');
      onPersonasChanged && onPersonasChanged();
    } catch (err) {
      console.error('[VinculadosSection] Error unlinking:', err);
      toast.error('No se pudo desvincular');
    }
  };

  return (
    <div style={{ background: 'var(--color-bg-base)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--color-border)' }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={14} color="var(--color-text-secondary)" />
          <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Personas vinculadas
          </h4>
        </div>
        <button onClick={() => setShowSearch((s) => !s)} className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
          <Plus size={13} /> Vincular
        </button>
      </div>

      {vinculados === null ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Cargando...</div>
      ) : vinculados.length === 0 ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Solo el titular, sin personas vinculadas.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {vinculados.map((v) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.3rem 0' }}>
              <span style={{ color: 'var(--color-text-primary)' }}>{v.clientes?.nombre || 'Cliente'} {v.clientes?.cpf ? `(${v.clientes.cpf})` : ''}</span>
              <button onClick={() => handleUnlink(v.cliente_id)} style={{ color: 'var(--color-text-muted)', display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Desvincular">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showSearch && (
        <div style={{ marginTop: '0.75rem' }}>
          <input
            type="text"
            autoFocus
            placeholder="Buscar cliente por nombre..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: '0.8rem' }}
          />
          {searching && <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.35rem' }}>Buscando...</div>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.35rem' }}>Sin resultados.</div>
          )}
          {results.length > 0 && (
            <div style={{ marginTop: '0.35rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', maxHeight: '160px', overflowY: 'auto' }}>
              {results.map((c) => (
                <div
                  key={c.id}
                  onClick={() => !linking && handleLink(c.id)}
                  style={{ padding: '0.4rem 0.6rem', cursor: linking ? 'wait' : 'pointer', fontSize: '0.8rem', borderBottom: '1px solid var(--color-border)' }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'var(--surface-elevated)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {c.nombre || 'Sin nombre'} ({c.cpf || 'Sin CPF'})
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function ClientViewTramites({
  _clientId,
  entradas = [],
  catalogoTramites = [],
  operariosList = [],
  onCreateTramite,
  onUpdateEstado,
  onUpdateServicio,
  onUpdateOperario,
  _onUpdateDatos,
  onDeleteTramite,
  defaultExpanded = true,
}) {
  const queryClient = useQueryClient();
  const [isSectionExpanded, setIsSectionExpanded] = useState(defaultExpanded);
  const [expandedId, setExpandedId] = useState(null);
  const [notasCache, setNotasCache] = useState({}); // { [entradaId]: nota[] }
  const [loadingNotas, setLoadingNotas] = useState(null);
  const [newNotaText, setNewNotaText] = useState('');
  const [sendingNota, setSendingNota] = useState(false);
  const [editingNotaId, setEditingNotaId] = useState(null);
  const [editNotaText, setEditNotaText] = useState('');
  const [savingEditNota, setSavingEditNota] = useState(false);
  const [etiquetasList, setEtiquetasList] = useState([]);
  const [localEntradas, setLocalEntradas] = useState(entradas);

  useEffect(() => {
    setLocalEntradas(entradas);
  }, [entradas]);

  useEffect(() => {
    getEtiquetas().then(setEtiquetasList).catch(console.error);
  }, []);

  const sortedEntradas = [...localEntradas].sort((a, b) => {
    const dateA = new Date(b.creado_en || b.created_at || 0).getTime();
    const dateB = new Date(a.creado_en || a.created_at || 0).getTime();
    return dateA - dateB;
  });

  const handleToggle = useCallback(async (entradaId) => {
    if (expandedId === entradaId) {
      setExpandedId(null);
      setNewNotaText('');
      return;
    }

    setExpandedId(entradaId);
    setNewNotaText('');

    // Load notas if not cached
    if (!notasCache[entradaId]) {
      setLoadingNotas(entradaId);
      try {
        const notas = await getNotasTramite(entradaId);
        const mappedNotas = notas.map(n => ({
           ...n,
           _esKommo: n.creado_por === 'kommo'
        }));
        setNotasCache(prev => ({ ...prev, [entradaId]: mappedNotas }));
      } catch (err) {
        console.error('[ClientViewTramites] Error loading notas:', err);
        setNotasCache(prev => ({ ...prev, [entradaId]: [] }));
      } finally {
        setLoadingNotas(null);
      }
    }
  }, [expandedId, notasCache]);

  const handleAddNota = useCallback(async (entradaId) => {
    if (!newNotaText.trim()) return;

    setSendingNota(true);
    try {
      const nota = await createNotaTramite({
        entrada_id: entradaId,
        texto: newNotaText,
      });
      setNotasCache(prev => ({
        ...prev,
        [entradaId]: [nota, ...(prev[entradaId] || [])],
      }));
      setNewNotaText('');
      toast.success('Nota agregada');
    } catch (err) {
      console.error('[ClientViewTramites] Error creating nota:', err);
      toast.error('Error al agregar la nota');
    } finally {
      setSendingNota(false);
    }
  }, [newNotaText]);

  const handleStartEditNota = useCallback((nota) => {
    setEditingNotaId(nota.id);
    setEditNotaText(nota.texto);
  }, []);

  const handleCancelEditNota = useCallback(() => {
    setEditingNotaId(null);
    setEditNotaText('');
  }, []);

  const handleSaveEditNota = useCallback(async (entradaId) => {
    if (!editNotaText.trim()) return;
    setSavingEditNota(true);
    try {
      const updated = await updateNotaTramite(editingNotaId, editNotaText);
      setNotasCache(prev => ({
        ...prev,
        [entradaId]: (prev[entradaId] || []).map(n => n.id === editingNotaId ? updated : n),
      }));
      setEditingNotaId(null);
      setEditNotaText('');
      toast.success('Nota actualizada');
    } catch (err) {
      console.error('[ClientViewTramites] Error updating nota:', err);
      toast.error('Error al actualizar la nota');
    } finally {
      setSavingEditNota(false);
    }
  }, [editingNotaId, editNotaText]);

  const handleKeyDown = (e, entradaId) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddNota(entradaId);
    }
  };

  return (
    <section className="glass-panel" style={{ overflow: 'hidden', flexShrink: 0 }}>
      {/* Header colapsable */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: isSectionExpanded ? '1px solid var(--color-border)' : 'none', cursor: 'pointer' }}
        onClick={() => setIsSectionExpanded(!isSectionExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
          <FileText size={18} color="var(--color-info)" />
          <h3 style={{ font: 'var(--font-section-title)', margin: 0, fontSize: '1rem' }}>Operaciones ({sortedEntradas.length})</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); onCreateTramite(); }} style={{ padding: '0.2rem', color: 'var(--color-text-muted)' }}>
            <Plus size={18} />
          </button>
          {isSectionExpanded ? <ChevronUp size={18} color="var(--color-text-muted)" /> : <ChevronDown size={18} color="var(--color-text-muted)" />}
        </div>
      </div>

      {/* Lista de trámites */}
      {isSectionExpanded && (
        <div style={{ padding: '1.25rem' }}>
      {sortedEntradas.length === 0 ? (
        <EmptyState
          title="Todavía no hay operaciones"
          description="Registra la primera operación de este cliente para empezar a seguir su avance."
          actionLabel="Crear operación"
          onAction={onCreateTramite}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sortedEntradas.map((t) => {
            const isExpanded = expandedId === t.id;
            const mappedState = mapLegacyState(t.estado_tramite);
            const estadoColor = TRAMITE_COLORS[mappedState] || TRAMITE_COLORS.entrante;
            const notas = notasCache[t.id] || [];
            const isLoadingThisNotas = loadingNotas === t.id;

            return (
              <div
                key={t.id}
                style={{
                  border: `1px solid ${isExpanded ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s ease',
                }}
              >
                {/* Accordion Header */}
                <div
                  onClick={() => handleToggle(t.id)}
                  style={{
                    padding: '0.75rem 1rem',
                    background: isExpanded ? 'var(--color-bg-elevated)' : 'transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                    {isExpanded ? <ChevronUp size={16} color="var(--color-primary)" /> : <ChevronDown size={16} color="var(--color-text-muted)" />}
                    <span style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {t.servicio?.toUpperCase() || 'OPERACIÓN'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    {t.es_titular === false && (
                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(124,92,191,0.15)',
                        color: '#7C5CBF',
                      }}>
                        VINCULADO
                      </span>
                    )}
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      background: estadoColor.bg,
                      color: estadoColor.color,
                    }}>
                      {mappedState.replace('_', ' ').toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                      {formatDate(t.creado_en)}
                    </span>
                  </div>
                </div>

                {/* Accordion Body — Expanded */}
                {isExpanded && (
                  <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Detalles del trámite */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Tipo de operación</span>
                        <select
                          value={t.servicio || ''}
                          onChange={(e) => onUpdateServicio && onUpdateServicio(t.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            background: 'var(--color-info-bg, rgba(55,138,221,0.15))',
                            color: 'var(--color-info)',
                            padding: '0.25rem 0.6rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            border: 'none',
                            outline: 'none',
                            cursor: 'pointer',
                            maxWidth: '60%',
                          }}
                        >
                          <option value="">SELECCIONAR...</option>
                          {/* Opciones del catálogo (sin los contenedores internos de FastOp) */}
                          {catalogoTramites.filter(cat => !cat.fastop_tipo).map(cat => (
                            <option key={cat.id} value={cat.nombre}>{cat.nombre}</option>
                          ))}
                          {/* Si el trámite actual no está en el catálogo, mostrarlo también */}
                          {t.servicio && !catalogoTramites.some(cat => cat.nombre.toUpperCase() === t.servicio.toUpperCase()) && (
                            <option value={t.servicio}>{t.servicio.toUpperCase()}</option>
                          )}
                        </select>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Operacional</span>
                        <select
                          value={t.operario || ''}
                          onChange={(e) => onUpdateOperario && onUpdateOperario(t.id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-elevated)',
                            color: 'var(--color-text-primary)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          <option value="">Sin asignar</option>
                          {operariosList.map(op => (
                            <option key={op.id} value={op.nombre}>{op.nombre}</option>
                          ))}
                          {/* Si el operario actual no está en la lista, mostrarlo */}
                          {t.operario && !operariosList.some(op => op.nombre === t.operario) && (
                            <option value={t.operario}>{t.operario}</option>
                          )}
                        </select>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Estado</span>
                        <select
                          value={mappedState}
                          onChange={(e) => {
                            const legacyVal = mapStageToLegacy(e.target.value);
                            onUpdateEstado(t.id, legacyVal);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            border: 'none',
                            background: estadoColor.bg,
                            color: estadoColor.color,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          <option value="entrante">Clientes Entrantes</option>
                          <option value="esperando_cliente">Esperando por el cliente</option>
                          <option value="esperando">Esperando</option>
                          <option value="cobranza">Realizar Cobranza</option>
                          <option value="logrado">Logrado con Éxito</option>
                        </select>
                      </div>

                      {/* Etiquetas */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Etiquetas</span>
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
                          {(t.etiquetas_ids || []).map(tagId => {
                            const tag = etiquetasList.find(e => e.id === tagId);
                            if (!tag) return null;
                            return (
                              <div
                                key={tag.id}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                                  padding: '0.15rem 0.4rem', borderRadius: '4px',
                                  background: `${tag.color}20`, border: `1px solid ${tag.color}40`,
                                  color: tag.color, fontSize: '0.7rem', fontWeight: 600
                                }}
                              >
                                {tag.nombre}
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const newTags = t.etiquetas_ids.filter(id => id !== tag.id);
                                    setLocalEntradas(prev => prev.map(ent => ent.id === t.id ? { ...ent, etiquetas_ids: newTags } : ent));
                                    await updateEntradaEtiquetas(t.id, newTags);
                                  }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: tag.color, opacity: 0.7 }}
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            );
                          })}
                          
                          <select
                            value=""
                            onChange={async (e) => {
                              const selectedId = e.target.value;
                              if (!selectedId) return;
                              const currentTags = t.etiquetas_ids || [];
                              if (!currentTags.includes(selectedId)) {
                                const newTags = [...currentTags, selectedId];
                                setLocalEntradas(prev => prev.map(ent => ent.id === t.id ? { ...ent, etiquetas_ids: newTags } : ent));
                                await updateEntradaEtiquetas(t.id, newTags);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              padding: '0.15rem 0.4rem', borderRadius: '4px',
                              border: '1px dashed var(--color-border)', background: 'transparent',
                              color: 'var(--color-text-muted)', fontSize: '0.7rem', outline: 'none', cursor: 'pointer'
                            }}
                          >
                            <option value="">+ Añadir</option>
                            {etiquetasList.filter(et => !(t.etiquetas_ids || []).includes(et.id)).map(et => (
                              <option key={et.id} value={et.id}>{et.nombre}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onDeleteTramite) onDeleteTramite(t.id);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.35rem 0.6rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            background: 'rgba(239, 68, 68, 0.05)',
                            color: 'rgb(239, 68, 68)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)'}
                        >
                          <Trash2 size={14} />
                          Eliminar operación
                        </button>
                      </div>
                    </div>

                    <PagosSection
                      entrada={t}
                      catalogoTramites={catalogoTramites}
                      onCostoUpdated={(entradaId, nuevoValor) => setLocalEntradas(prev => prev.map(ent => ent.id === entradaId ? { ...ent, valor: nuevoValor } : ent))}
                    />

                    <VinculadosSection
                      entrada={t}
                      onPersonasChanged={() => queryClient.invalidateQueries({ queryKey: ['entradas'] })}
                    />

                    {/* Separador */}
                    <div style={{ height: '1px', background: 'var(--color-border)', marginTop: '0.5rem' }} />

                    {/* Historial del Trámite */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h4 style={{
                          margin: 0, fontSize: '0.8rem', fontWeight: 600,
                          color: 'var(--color-text-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}>
                          Historial de la operación
                        </h4>
                      </div>

                      {/* Input para nueva nota */}
                      <div style={{
                        display: 'flex', gap: '0.5rem', marginBottom: '0.75rem',
                      }}>
                        <input
                          type="text"
                          placeholder="Agregar nota al historial..."
                          value={newNotaText}
                          onChange={(e) => setNewNotaText(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, t.id)}
                          onClick={(e) => e.stopPropagation()}
                          disabled={sendingNota}
                          style={{
                            flex: 1,
                            padding: '0.5rem 0.75rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-elevated)',
                            color: 'var(--color-text-primary)',
                            fontSize: '0.8rem',
                            outline: 'none',
                          }}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAddNota(t.id); }}
                          disabled={sendingNota || !newNotaText.trim()}
                          className="btn btn-primary"
                          style={{
                            padding: '0.5rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: sendingNota || !newNotaText.trim() ? 0.5 : 1,
                          }}
                        >
                          {sendingNota ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        </button>
                      </div>

                      {/* Timeline de notas */}
                      {isLoadingThisNotas ? (
                        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                          <Loader2 size={18} className="animate-spin" style={{ display: 'inline-block', marginRight: '0.5rem' }} />
                          Cargando historial...
                        </div>
                      ) : notas.length === 0 ? (
                        <div style={{
                          textAlign: 'center', padding: '1rem',
                          color: 'var(--color-text-muted)', fontSize: '0.8rem',
                          fontStyle: 'italic',
                        }}>
                          Sin notas en el historial. Agrega la primera nota arriba.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', maxHeight: '300px', overflowY: 'auto' }}>
                          {/* Línea vertical del timeline */}
                          <div style={{
                            position: 'absolute',
                            left: '52px',
                            top: '8px',
                            bottom: '8px',
                            width: '2px',
                            background: 'var(--color-border)',
                            borderRadius: '1px',
                          }} />

                          {notas.map((nota, idx) => (
                            <div
                              key={nota.id}
                              style={{
                                display: 'flex',
                                gap: '1rem',
                                padding: '0.6rem 0',
                                position: 'relative',
                                alignItems: 'flex-start',
                              }}
                            >
                              {/* Fecha */}
                              <div style={{
                                width: '44px', flexShrink: 0,
                                fontSize: '0.7rem', fontWeight: 600,
                                color: idx === 0 ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                textAlign: 'right',
                                lineHeight: '1.4',
                                paddingTop: '2px',
                              }}>
                                {new Date(nota.creado_en).toLocaleDateString('es', { day: '2-digit', month: '2-digit' })}
                              </div>

                              {/* Dot del timeline */}
                              <div style={{
                                width: '8px', height: '8px',
                                borderRadius: '50%',
                                background: idx === 0 ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                flexShrink: 0,
                                marginTop: '5px',
                                position: 'relative',
                                zIndex: 1,
                                boxShadow: idx === 0 ? '0 0 0 3px rgba(55,138,221,0.2)' : 'none',
                              }} />

                              {/* Texto */}
                              <div style={{
                                flex: 1,
                                fontSize: '0.8rem',
                                color: 'var(--color-text-primary)',
                                lineHeight: '1.5',
                                paddingTop: '1px',
                              }}>
                                {nota._esKommo && (
                                  <div style={{ display: "inline-flex", fontSize: "0.65rem", fontWeight: 700, background: "rgba(245,158,11,0.15)", color: "#f59e0b", padding: "1px 6px", borderRadius: "4px", marginBottom: "0.3rem", letterSpacing: "0.04em" }}>📌 KOMMO</div>
                                )}
                                {editingNotaId === nota.id ? (
                                  <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <textarea
                                      autoFocus
                                      value={editNotaText}
                                      onChange={(e) => setEditNotaText(e.target.value)}
                                      rows={2}
                                      style={{ width: '100%', resize: 'vertical', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-primary)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', fontSize: '0.8rem', outline: 'none' }}
                                    />
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                      <button onClick={() => handleSaveEditNota(t.id)} disabled={savingEditNota || !editNotaText.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-success)' }}>
                                        {savingEditNota ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar
                                      </button>
                                      <button onClick={handleCancelEditNota} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                        <X size={12} /> Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                    <div style={{ whiteSpace: "pre-wrap", flex: 1 }}>{nota.texto}</div>
                                    {!nota._esKommo && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleStartEditNota(nota); }}
                                        style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
                                        aria-label="Editar nota"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
        </div>
      )}
    </section>
  );
}
