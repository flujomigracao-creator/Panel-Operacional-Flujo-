import React, { useState, useEffect } from 'react';
import { Sparkles, X, ArrowRight, AlertTriangle, UserPlus, MoveRight, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { reassignDocument } from '../services/storageService';
import { createCliente } from '../services/clientesService';
import { normalizeDateToDDMMYYYY } from '../utils/dateFormatter';
import { toIsoDate, FIXED_FIELDS_CATALOG } from './clientView.constants';

/**
 * Columnas reales de `clientes`. Los 13 campos migratorios (rnm, numero_pasaporte,
 * nombre_madre, etc.) ya NO están en FIXED_FIELDS_CATALOG — este Set los excluye
 * automáticamente, así que se leen/escriben desde campos_personalizados.
 */
const FIXED_COLUMN_IDS = new Set(FIXED_FIELDS_CATALOG.map(f => f.id));

const fieldMap = {
  'NOMBRE_COMPLETO': 'nombre',
  'CPF': 'cpf',
  'RNM': 'rnm',
  'CARNET_IDENTIDAD': 'carnet_identidad',
  'FECHA_NACIMIENTO': 'fecha_nacimiento',
  'LUGAR_NACIMIENTO': 'lugar_nacimiento',
  'NACIONALIDAD': 'nacionalidad',
  'NUMERO_DOCUMENTO': 'numero_pasaporte',
  'NUMERO_REFUGIO': 'numero_refugio',
  'FECHA_EMISION_PASAPORTE': 'fecha_emision_pasaporte',
  'FECHA_VENCIMIENTO_PASAPORTE': 'fecha_vencimiento_pasaporte',
  'FECHA_VENCIMIENTO_REFUGIO': 'fecha_vencimiento_refugio',
  'SEXO': 'sexo',
  'NOMBRE_MADRE': 'nombre_madre',
  'NOMBRE_PADRE': 'nombre_padre'
};

export default function ClientViewExtractionModal({
  isOpen,
  extractedData,
  cliente,
  uploadedDocRecord,
  onClose,
  onExtractedDataChange,
  onSave,
  isSaving,
  _onNavigateToClient
}) {
  const [mismatchState, setMismatchState] = useState({ show: false, type: null, matchedClient: null, isProcessing: false });
  const [manualSearch, setManualSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    if (!manualSearch || manualSearch.length < 3) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, cpf')
        .ilike('nombre', `%${manualSearch}%`)
        .neq('id', cliente?.id || 0)
        .limit(5);
      setSearchResults(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [manualSearch, cliente?.id]);

  const handleMoveToSelected = async (targetClient) => {
    if (!uploadedDocRecord || !targetClient) return;
    setMismatchState(prev => ({ ...prev, isProcessing: true }));
    const { success, error } = await reassignDocument(uploadedDocRecord.id, targetClient.id);
    if (success) {
      alert(`Documento movido a ${targetClient.nombre} exitosamente.`);
      onClose(true);
    } else {
      alert('Error al mover documento: ' + error);
      setMismatchState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  // ── Name comparison logic ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !extractedData || !cliente) {
      setMismatchState({ show: false, type: null, matchedClient: null, isProcessing: false });
      return;
    }

    const normalize = (name) => name?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() || '';
    const currentName = normalize(cliente.nombre);
    const extractedName = normalize(extractedData.NOMBRE_COMPLETO);

    // Heuristic: different if they share NO words, or if they only share 1 word and their first names don't match.
    const isDifferent = () => {
      if (!currentName || !extractedName) return false;
      const w1 = currentName.split(/\s+/).filter(w => w.length > 2);
      const w2 = extractedName.split(/\s+/).filter(w => w.length > 2);
      if (w1.length === 0 || w2.length === 0) return false;
      
      const firstNamesMatch = w1[0] === w2[0];
      const sharedWords = w1.filter(w => w2.includes(w)).length;
      
      return sharedWords === 0 || (sharedWords === 1 && !firstNamesMatch);
    };

    if (isDifferent() || (extractedData.CPF && cliente.cpf && extractedData.CPF !== cliente.cpf)) {
      // It's vastly different! Let's search if this person exists.
      const checkExists = async () => {
        try {
          let query = supabase.from('clientes').select('id, nombre').neq('id', cliente.id);
          
          if (extractedData.CPF) {
            query = query.eq('cpf', extractedData.CPF);
          } else {
            // Very naive exact or ilike match. For better matching, could use text search.
            query = query.ilike('nombre', `%${extractedData.NOMBRE_COMPLETO}%`);
          }

          const { data } = await query.limit(1);
          if (data && data.length > 0) {
            setMismatchState({ show: true, type: 'EXISTS', matchedClient: data[0], isProcessing: false });
          } else {
            setMismatchState({ show: true, type: 'NEW', matchedClient: null, isProcessing: false });
          }
        } catch (err) {
          console.error('Error checking existing client', err);
        }
      };
      checkExists();
    } else {
      setMismatchState({ show: false, type: null, matchedClient: null, isProcessing: false });
    }
  }, [isOpen, extractedData, cliente]);

  const handleMoveToExisting = async () => {
    if (!uploadedDocRecord || !mismatchState.matchedClient) return;
    setMismatchState(prev => ({ ...prev, isProcessing: true }));
    const { success, error } = await reassignDocument(uploadedDocRecord.id, mismatchState.matchedClient.id);
    if (success) {
      alert(`Documento movido a ${mismatchState.matchedClient.nombre} exitosamente.`);
      onClose(true);
    } else {
      alert('Error al mover documento: ' + error);
      setMismatchState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const handleCreateNewClient = async () => {
    if (!uploadedDocRecord) return;
    setMismatchState(prev => ({ ...prev, isProcessing: true }));
    try {
      // rnm y carnet_identidad ya no son columnas reales de `clientes` — viven
      // en el JSONB campos_personalizados.
      const camposPersonalizados = {};
      if (extractedData.RNM) camposPersonalizados.rnm = extractedData.RNM;
      if (extractedData.CARNET_IDENTIDAD) camposPersonalizados.carnet_identidad = extractedData.CARNET_IDENTIDAD;

      const newClientData = {
        nombre: extractedData.NOMBRE_COMPLETO?.toUpperCase() || 'NUEVO CLIENTE',
        cpf: extractedData.CPF || '',
        nacionalidad: extractedData.NACIONALIDAD?.toUpperCase() || '',
        fecha_nacimiento: extractedData.FECHA_NACIMIENTO ? toIsoDate(normalizeDateToDDMMYYYY(extractedData.FECHA_NACIMIENTO)) : null,
        sexo: extractedData.SEXO?.toUpperCase() || '',
        ...(Object.keys(camposPersonalizados).length > 0 ? { campos_personalizados: camposPersonalizados } : {}),
      };

      const newClient = await createCliente(newClientData);
      
      // Crear relacionamiento con el cliente original
      if (cliente && cliente.id) {
        await supabase.from('relaciones_clientes').insert({
          cliente_id: cliente.id,
          cliente_relacionado_id: newClient.id,
          tipo_relacion: 'Familiar'
        });
      }
      
      const { success, error } = await reassignDocument(uploadedDocRecord.id, newClient.id);
      if (success) {
        alert('Cliente creado, relacionamiento añadido y documento asignado exitosamente.');
        onClose(true);
      } else {
        alert('Cliente creado pero hubo un error al reasignar el documento: ' + error);
      }
    } catch (err) {
      console.error(err);
      alert('Error al crear el nuevo cliente.');
      setMismatchState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  if (!isOpen || !extractedData) return null;

  const handleDiscardField = (key) => {
    const newData = { ...extractedData };
    delete newData[key];
    onExtractedDataChange(newData);
  };

  const hasExtractableFields = Object.keys(extractedData).some(k => k !== 'ILEGIBLE' && extractedData[k]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '700px', padding: '1.5rem', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)', flexShrink: 0 }}>
          <Sparkles size={18} /> Datos Extraídos vs Actuales
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem', flexShrink: 0 }}>
          Revisa los datos extraídos por la IA (izquierda). Pulsa la "X" si prefieres mantener el dato que ya tenías (derecha).
        </p>

        {mismatchState.show && (
          <div style={{ background: 'var(--color-warning-light)', border: '1px solid var(--color-warning)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', color: 'var(--color-warning-dark)' }}>
              <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Posible documento extraviado</strong>
                {mismatchState.type === 'EXISTS' ? (
                  <span>El documento está a nombre de <strong>{extractedData.NOMBRE_COMPLETO}</strong>. Hemos encontrado un perfil existente para <strong>{mismatchState.matchedClient?.nombre}</strong>.</span>
                ) : (
                  <span>El documento está a nombre de <strong>{extractedData.NOMBRE_COMPLETO}</strong>, muy diferente a <strong>{cliente?.nombre}</strong>.</span>
                )}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {mismatchState.type === 'EXISTS' ? (
                <button 
                  onClick={handleMoveToExisting} 
                  disabled={mismatchState.isProcessing}
                  className="btn btn-primary" 
                  style={{ background: 'var(--color-warning-dark)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <MoveRight size={16} /> Mover al perfil existente
                </button>
              ) : (
                <button 
                  onClick={handleCreateNewClient} 
                  disabled={mismatchState.isProcessing}
                  className="btn btn-primary" 
                  style={{ background: 'var(--color-warning-dark)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <UserPlus size={16} /> Crear nuevo cliente y mover
                </button>
              )}
              <button 
                onClick={() => setMismatchState({ ...mismatchState, show: false })}
                disabled={mismatchState.isProcessing}
                className="btn btn-secondary"
              >
                Ignorar advertencia
              </button>
            </div>

            <div style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-warning-dark)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Search size={14} /> ¿Ya existe este cliente? Búscalo manualmente:
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Buscar por nombre..." 
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value)}
                  style={{ flex: 1, minWidth: '200px', padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
                />
              </div>
              {searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                  {searchResults.map(res => (
                    <button
                      key={res.id}
                      onClick={() => handleMoveToSelected(res)}
                      disabled={mismatchState.isProcessing}
                      className="btn btn-ghost btn-sm"
                      style={{ textAlign: 'left', justifyContent: 'flex-start', background: 'rgba(255,255,255,0.6)', color: 'var(--color-warning-dark)' }}
                    >
                      <MoveRight size={14} style={{ marginRight: '0.5rem' }} /> Mover a: {res.nombre} {res.cpf ? `(${res.cpf})` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
        
        {extractedData.ILEGIBLE && (
          <div style={{ background: 'rgba(216,90,48,0.1)', color: '#D85A30', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <span style={{ fontWeight: 600 }}>⚠️ Aviso:</span> La parte superior del documento estaba borrosa, verifica que sean correctos.
          </div>
        )}

        {!hasExtractableFields && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
            No hay más datos extraídos para revisar.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
          {Object.entries(extractedData).map(([k, v]) => {
            // NOMBRE_ARCHIVO no es un dato del cliente: lo agrega el propio código
            // como nombre sugerido de archivo (ver AI_IGNORED_KEYS en useClientViewExtraction.js).
            if (!v || k === 'ILEGIBLE' || k === 'TIPO_DOCUMENTO' || k === 'NOMBRE_ARCHIVO') return null;
            const clientField = fieldMap[k];
            // Si la IA encontró un dato que no está en el mapeo fijo, se va a
            // guardar como campo dinámico nuevo (ver useClientViewExtraction) —
            // el identificador es el mismo que va a usar el guardado.
            const dynamicIdentificador = !clientField
              ? k.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
              : null;
            const existingValue = clientField && cliente
              ? (FIXED_COLUMN_IDS.has(clientField) ? cliente[clientField] : cliente.campos_personalizados?.[clientField])
              : (dynamicIdentificador ? cliente?.campos_personalizados?.[dynamicIdentificador] : '');

            return (
              <div key={k} style={{ display: 'flex', gap: '1rem', alignItems: 'stretch' }}>
                {/* AI Extracted Data */}
                <div style={{ flex: 1, background: 'var(--color-bg-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-primary)', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)', textTransform: 'uppercase', fontWeight: 600 }}>Extraído: {k}</div>
                    <button 
                      onClick={() => handleDiscardField(k)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '2px', borderRadius: '4px' }}
                      title="Descartar este dato y usar el actual"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <input
                    className="form-input"
                    type="text"
                    value={v || ''}
                    onChange={(e) => onExtractedDataChange({ ...extractedData, [k]: e.target.value })}
                    style={{ fontSize: '0.875rem', fontWeight: 500, width: '100%', borderColor: 'transparent', background: 'var(--color-bg-canvas)' }}
                  />
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)' }}>
                  <ArrowRight size={16} />
                </div>

                {/* Existing Data */}
                <div style={{ flex: 1, background: 'rgba(0,0,0,0.1)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', opacity: 0.7 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 500 }}>
                    {clientField ? `Dato Actual (${clientField})` : (existingValue ? 'Dato Actual (campo personalizado)' : '✨ Se creará como campo nuevo')}
                  </div>
                  <input
                    className="form-input"
                    type="text"
                    value={existingValue || '—'}
                    disabled
                    style={{ fontSize: '0.875rem', fontWeight: 500, width: '100%', background: 'transparent', borderColor: 'transparent', color: 'var(--color-text-secondary)', cursor: 'not-allowed' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', flexShrink: 0, marginTop: '1rem' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onSave} disabled={isSaving || !hasExtractableFields}>
            {isSaving ? 'Guardando...' : 'Aplicar Extraídos'}
          </button>
        </div>
      </div>
    </div>
  );
}
