import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { getConfigCamposClientes } from '../../services/clientesService';
import { Loader2, Save, Link, RefreshCw, AlertTriangle, Key, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

// Campos nativos de Kommo para contactos
const KOMMO_NATIVE_CONTACT_FIELDS = [
  { id: 'name', name: 'Nombre' },
];

// entity indica en qué pestaña de mapeo (contactos o leads) tiene sentido ofrecer cada campo:
// son columnas de tablas distintas (clientes vs. entradas), así que no se comparten.
const LOCAL_FIXED_FIELDS = [
  { id: 'nombre', name: 'Nombre Completo', entity: 'contacts' },
  { id: 'cpf', name: 'CPF', entity: 'contacts' },
  { id: 'telefono', name: 'Teléfono', entity: 'contacts' },
  { id: 'email', name: 'Email', entity: 'contacts' },
  { id: 'id_kommo', name: 'ID Kommo', entity: 'contacts' },
  // El nombre del trámite (entradas.servicio) se toma de acá, no de un texto fijo por etapa:
  // mapeá el campo "TRÁMITE" (u otro que uses) de tus leads en Kommo a esta opción.
  { id: 'servicio', name: 'Trámite / Servicio', entity: 'leads' },
  { id: 'nombre_pix', name: 'Nombre PIX', entity: 'leads' },
  // Estos tres son campos que en Kommo suelen vivir en el LEAD (no en el contacto), pero
  // se guardan en la ficha del cliente — por eso están acá y no en "Mapear Contactos".
  { id: 'pais', name: 'País (cliente)', entity: 'leads' },
  { id: 'ciudad', name: 'Ciudad (cliente)', entity: 'leads' },
  { id: 'estado_federal', name: 'Estado (cliente)', entity: 'leads' },
  { id: 'atendente', name: 'Atendente (cliente)', entity: 'leads' },

  // ── Campos Base ────────────────────────────────────────────────────────────
  // Estos SÍ siguen siendo columnas fijas reales de `clientes` (no forman parte
  // de los 13 campos migratorios). Los 13 migratorios (rnm, numero_refugio,
  // fecha_vencimiento_refugio, numero_pasaporte, fecha_emision_pasaporte,
  // fecha_vencimiento_pasaporte, carnet_identidad, policia_federal,
  // fecha_entrada_brasil, lugar_entrada_brasil, nombre_madre, nombre_padre,
  // tramite) ya NO están acá: ahora existen como filas en config_campos_clientes
  // y se cargan dinámicamente más abajo en loadData() con type: 'json', apareciendo
  // en el optgroup "Campos Personalizados" (van a clientes.campos_personalizados).
  { id: 'fecha_nacimiento', name: 'Fecha Nacimiento', entity: 'contacts', group: 'Campos Base' },
  { id: 'estado_civil', name: 'Estado Civil', entity: 'contacts', group: 'Campos Base' },
  { id: 'sexo', name: 'Sexo', entity: 'contacts', group: 'Campos Base' },
  { id: 'nacionalidad', name: 'Nacionalidad', entity: 'contacts', group: 'Campos Base' },
  { id: 'lugar_nacimiento', name: 'Lugar de Nacimiento', entity: 'contacts', group: 'Campos Base' },
  { id: 'direccion', name: 'Dirección Completa', entity: 'contacts', group: 'Campos Base' },
];

export default function KommoSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeTab, setActiveTab] = useState('credentials'); // 'credentials', 'mappings_contacts', 'mappings_leads', 'mappings_stages'

  // Credentials
  const [creds, setCreds] = useState({ subdominio: '', token: '' });
  const [isTested, setIsTested] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState('');
  
  // Fields from Kommo
  const [kommoContactFields, setKommoContactFields] = useState([]);
  const [kommoLeadFields, setKommoLeadFields] = useState([]);
  
  // Local Fields
  const [localFields, setLocalFields] = useState([]);
  
  // Mappings
  const [mappings, setMappings] = useState([]);

  // Pipelines/etapas de Kommo y su mapeo a un trámite local
  const [kommoPipelines, setKommoPipelines] = useState([]);
  const [stageMappings, setStageMappings] = useState([]); // [{ kommo_pipeline_id, kommo_stage_id, tramite }]

  // Vincular id_kommo faltante (clientes creados sin pasar por un webhook de Kommo)
  const [linkingIds, setLinkingIds] = useState(false);
  const [linkResult, setLinkResult] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // 1. Load Creds (fila única, empresa sin multi-tenant)
      const { data: credsData } = await supabase.from('integraciones_kommo').select('*').limit(1).maybeSingle();
      if (credsData) {
        setCreds({ subdominio: credsData.subdominio, token: credsData.token });
        setWebhookSecret(credsData.webhook_secret || '');
        setIsTested(true); // Assuming they are tested if they exist
      }

      // 2. Load Local Fields (fijos + dinámicos definidos en Configuración > Campos Base)
      const customFields = await getConfigCamposClientes();
      const allLocalFields = [
        ...LOCAL_FIXED_FIELDS.map(f => ({ ...f, type: 'fixed', group: f.group || 'Campos Principales' })),
        // Los campos dinámicos no tienen columna propia, así que no restringimos
        // por `entity`: se ofrecen igual en el mapeo de contactos y de leads.
        ...customFields.map(f => ({ id: f.identificador, name: f.nombre_campo, type: 'json', group: 'Campos Personalizados' })),
      ];
      setLocalFields(allLocalFields);

      // 3. Load Mappings
      const { data: mappingsData } = await supabase.from('kommo_field_mappings').select('*');
      if (mappingsData) {
        setMappings(mappingsData);
      }

      // 4. Load Stage Mappings
      const { data: stageMappingsData } = await supabase.from('kommo_stage_mappings').select('*');
      if (stageMappingsData) {
        setStageMappings(stageMappingsData);
      }

    } catch (err) {
      console.error(err);
      toast.error('Error al cargar la configuración de Kommo');
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!creds.subdominio || !creds.token) {
      toast.error('Ingresa subdominio y token');
      return;
    }
    setTesting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kommo-proxy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'test_connection',
          subdominio: creds.subdominio,
          token: creds.token
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success('¡Conexión exitosa con Kommo!');
        setIsTested(true);
        await saveCreds();
        await fetchKommoFields();
      } else {
        toast.error(data.error || 'Error al conectar');
        setIsTested(false);
      }
    } catch (_err) {
      toast.error('Error de red al conectar con proxy');
      setIsTested(false);
    } finally {
      setTesting(false);
    }
  };

  const saveCreds = async () => {
    try {
      // El secreto autentica el webhook entrante de Kommo (ver kommo-webhook);
      // se genera una sola vez y se reutiliza en cada guardado posterior.
      const secret = webhookSecret || crypto.randomUUID();
      if (secret !== webhookSecret) setWebhookSecret(secret);

      const { data: existing } = await supabase.from('integraciones_kommo').select('id').limit(1).maybeSingle();
      if (existing) {
        await supabase.from('integraciones_kommo').update({ subdominio: creds.subdominio, token: creds.token, webhook_secret: secret }).eq('id', existing.id);
      } else {
        await supabase.from('integraciones_kommo').insert({ subdominio: creds.subdominio, token: creds.token, webhook_secret: secret });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchKommoFields = async () => {
    try {
       const { data: session } = await supabase.auth.getSession();
       const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kommo-proxy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'get_fields' })
      });
      const data = await res.json();
      if (data.success) {
        setKommoContactFields([...KOMMO_NATIVE_CONTACT_FIELDS, ...(data.contacts || [])]);
        setKommoLeadFields(data.leads || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchKommoPipelines = async () => {
    try {
       const { data: session } = await supabase.auth.getSession();
       const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kommo-proxy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'get_pipelines' })
      });
      const data = await res.json();
      if (data.success) {
        setKommoPipelines(data.pipelines || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // tramite ya no se pide por input de texto (se sacó de la UI) — la columna
  // sigue siendo NOT NULL en la base, así que usamos el nombre de la etapa
  // de Kommo como valor por defecto cuando se activa el registro.
  const upsertStageMapping = (pipeline, stage, updates) => {
    setStageMappings(prev => {
      const idx = prev.findIndex(m => m.kommo_pipeline_id === pipeline.id.toString() && m.kommo_stage_id === stage.id.toString());
      const existing = idx >= 0 ? prev[idx] : {
        kommo_pipeline_id: pipeline.id.toString(),
        kommo_pipeline_name: pipeline.name,
        kommo_stage_id: stage.id.toString(),
        kommo_stage_name: stage.name,
        tramite: stage.name,
        activa_registro: false,
      };
      const updated = { ...existing, ...updates };
      const rest = idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;

      // Sin activar registro, no hay nada que guardar para esta etapa.
      if (!updated.activa_registro) return rest;
      return [...rest, updated];
    });
  };

  const handleStageActivaRegistroChange = (pipeline, stage, activaRegistro) => {
    upsertStageMapping(pipeline, stage, { activa_registro: activaRegistro, tramite: stage.name });
  };

  const saveStageMappings = async () => {
    setSaving(true);
    try {
      await supabase.from('kommo_stage_mappings').delete().not('id', 'is', null);
      if (stageMappings.length > 0) {
        await supabase.from('kommo_stage_mappings').insert(stageMappings);
      }
      toast.success('Mapeo de etapas guardado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar el mapeo de etapas');
    } finally {
      setSaving(false);
    }
  };

  const handleMappingChange = (entity, kommoField, localFieldId) => {
    if (!localFieldId) {
      // Eliminar mapeo
      setMappings(prev => prev.filter(m => !(m.kommo_entity === entity && m.kommo_field_id === kommoField.id.toString())));
      return;
    }

    const localField = localFields.find(f => f.id === localFieldId);
    if (!localField) return;

    setMappings(prev => {
      const filtered = prev.filter(m => !(m.kommo_entity === entity && m.kommo_field_id === kommoField.id.toString()));
      return [...filtered, {
        kommo_entity: entity,
        kommo_field_id: kommoField.id.toString(),
        kommo_field_name: kommoField.name,
        local_field: localField.id,
        local_field_type: localField.type,
        is_identifier: false
      }];
    });
  };

  const handleIdentifierChange = (entity, kommoFieldId, isIdentifier) => {
     setMappings(prev => prev.map(m => {
        if (m.kommo_entity === entity && m.kommo_field_id === kommoFieldId) {
            return { ...m, is_identifier: isIdentifier };
        }
        return m;
     }));
  };

  const saveMappings = async () => {
    setSaving(true);
    try {
      // Eliminar antiguos
      await supabase.from('kommo_field_mappings').delete().not('id', 'is', null);

      // Insertar nuevos
      if (mappings.length > 0) {
        await supabase.from('kommo_field_mappings').insert(mappings);
      }
      toast.success('Mapeos guardados correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar mapeos');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
     if (isTested) {
         fetchKommoFields();
         fetchKommoPipelines();
     }
  }, [isTested]);

  const handleVincularIdsFaltantes = async () => {
    setLinkingIds(true);
    setLinkResult(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kommo-proxy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.session?.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'vincular_ids_faltantes' })
      });
      const data = await res.json();
      if (data.success) {
        setLinkResult(data);
        if (data.vinculados > 0) toast.success(`${data.vinculados} cliente(s) vinculado(s) con su ID de Kommo`);
        else toast('No se encontraron coincidencias nuevas para vincular', { icon: 'ℹ️' });
      } else {
        toast.error(data.error || 'Error al buscar los IDs en Kommo');
      }
    } catch (_err) {
      toast.error('Error de red al conectar con Kommo');
    } finally {
      setLinkingIds(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="animate-spin" /> Cargando configuración...</div>;

  const webhookUrl = webhookSecret
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kommo-webhook?secret=${webhookSecret}`
    : '';

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
        <button 
          onClick={() => setActiveTab('credentials')}
          style={{ padding: '0.75rem 1rem', background: 'none', border: 'none', borderBottom: activeTab === 'credentials' ? '2px solid var(--color-primary)' : '2px solid transparent', color: activeTab === 'credentials' ? 'var(--color-primary)' : 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: activeTab === 'credentials' ? 600 : 400 }}
        >
          1. Conexión y Webhook
        </button>
        <button 
          onClick={() => setActiveTab('mappings_contacts')}
          disabled={!isTested}
          style={{ padding: '0.75rem 1rem', background: 'none', border: 'none', borderBottom: activeTab === 'mappings_contacts' ? '2px solid var(--color-primary)' : '2px solid transparent', color: activeTab === 'mappings_contacts' ? 'var(--color-primary)' : 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: activeTab === 'mappings_contacts' ? 600 : 400, opacity: !isTested ? 0.5 : 1 }}
        >
          2. Mapear Contactos
        </button>
        <button
          onClick={() => setActiveTab('mappings_leads')}
          disabled={!isTested}
          style={{ padding: '0.75rem 1rem', background: 'none', border: 'none', borderBottom: activeTab === 'mappings_leads' ? '2px solid var(--color-primary)' : '2px solid transparent', color: activeTab === 'mappings_leads' ? 'var(--color-primary)' : 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: activeTab === 'mappings_leads' ? 600 : 400, opacity: !isTested ? 0.5 : 1 }}
        >
          3. Mapear Leads
        </button>
        <button
          onClick={() => setActiveTab('mappings_stages')}
          disabled={!isTested}
          style={{ padding: '0.75rem 1rem', background: 'none', border: 'none', borderBottom: activeTab === 'mappings_stages' ? '2px solid var(--color-primary)' : '2px solid transparent', color: activeTab === 'mappings_stages' ? 'var(--color-primary)' : 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: activeTab === 'mappings_stages' ? 600 : 400, opacity: !isTested ? 0.5 : 1 }}
        >
          4. Mapear Etapas
        </button>
      </div>

      {activeTab === 'credentials' && (
        <div style={{ background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Key size={18}/> Credenciales de API</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
            Crea una "Integración Privada" en Kommo (Ajustes &gt; Integraciones &gt; Crear Integración) para obtener el Token.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '500px', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Subdominio de Kommo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>https://</span>
                <input type="text" className="form-input" value={creds.subdominio} onChange={e => setCreds({...creds, subdominio: e.target.value})} placeholder="agencia-marcos" style={{ flex: 1 }} />
                <span style={{ color: 'var(--color-text-muted)' }}>.kommo.com</span>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Long-Lived Token</label>
              <div style={{ position: 'relative' }}>
                <textarea
                  className="form-input"
                  value={creds.token}
                  onChange={e => setCreds({...creds, token: e.target.value})}
                  placeholder="eyJ0eX..."
                  rows={3}
                  style={showToken ? undefined : { WebkitTextSecurity: 'disc', textSecurity: 'disc' }}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  className="btn btn-ghost"
                  style={{ position: 'absolute', top: '0.35rem', right: '0.35rem', padding: '0.25rem' }}
                  title={showToken ? 'Ocultar token' : 'Mostrar token'}
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleTestConnection} disabled={testing} style={{ alignSelf: 'flex-start' }}>
              {testing ? <Loader2 className="animate-spin" size={16} /> : <Link size={16} />} 
              {testing ? ' Probando...' : ' Probar Conexión y Guardar'}
            </button>
          </div>

          {isTested && (
            <div style={{ background: 'var(--color-success-bg, rgba(16,185,129,0.1))', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-success, #10b981)' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--color-success, #10b981)' }}>Configurar Webhook en Kommo</h4>
              <p style={{ fontSize: '0.875rem', margin: '0 0 0.5rem 0' }}>Pega esta URL en los ajustes de Webhooks de Kommo para recibir actualizaciones en tiempo real:</p>
              {webhookUrl ? (
                <code style={{ display: 'block', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', wordBreak: 'break-all', userSelect: 'all' }}>
                  {webhookUrl}
                </code>
              ) : (
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Guardá la conexión primero para que la URL del webhook quede activa.</p>
              )}
            </div>
          )}

          {isTested && (
            <div style={{ marginTop: '1.5rem', background: 'var(--color-bg-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9375rem' }}>Vincular clientes sin ID de Kommo</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '0 0 0.75rem 0' }}>
                Busca en Kommo, por teléfono, el contacto de cada cliente que no tenga ID de Kommo asignado (ej. clientes creados por WhatsApp directo) y lo vincula si encuentra una única coincidencia.
              </p>
              <button className="btn btn-secondary" onClick={handleVincularIdsFaltantes} disabled={linkingIds} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                {linkingIds ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                {linkingIds ? ' Buscando en Kommo...' : ' Buscar y vincular IDs faltantes'}
              </button>

              {linkResult && (
                <div style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
                  <p style={{ margin: '0 0 0.5rem 0' }}>
                    De {linkResult.total} cliente(s) sin ID: <strong style={{ color: 'var(--color-success, #10b981)' }}>{linkResult.vinculados} vinculado(s)</strong>, {linkResult.sinCoincidencia} sin coincidencia, {linkResult.ambiguos} ambiguo(s) (más de un contacto con ese teléfono en Kommo).
                  </p>
                  {linkResult.detalles?.filter(d => d.estado === 'ambiguo').length > 0 && (
                    <div style={{ background: 'var(--color-warning-bg, rgba(245,158,11,0.1))', border: '1px solid var(--color-warning, #f59e0b)', borderRadius: 'var(--radius-md)', padding: '0.75rem', marginTop: '0.5rem' }}>
                      <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}><AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Casos ambiguos — requieren revisión manual:</p>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                        {linkResult.detalles.filter(d => d.estado === 'ambiguo').map(d => (
                          <li key={d.cliente_id}>{d.nombre || `Cliente #${d.cliente_id}`} — posibles IDs: {d.opciones?.join(', ')}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(activeTab === 'mappings_contacts' || activeTab === 'mappings_leads') && (
        <div style={{ background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                 <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem' }}>
                    Mapeo de {activeTab === 'mappings_contacts' ? 'Contactos a Clientes' : 'Leads a Trámites'}
                 </h3>
                 <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                    Relaciona los campos personalizados de Kommo con los campos de tu sistema.
                 </p>
              </div>
              <button className="btn btn-primary" onClick={saveMappings} disabled={saving}>
                 {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} 
                 <span style={{ marginLeft: '4px' }}>Guardar Mapeos</span>
              </button>
           </div>

           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: '1rem', padding: '0.5rem 1rem', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', fontWeight: 600, fontSize: '0.875rem' }}>
              <div>Campo en Kommo</div>
              <div>Campo en Dashboard</div>
              <div style={{ textAlign: 'center' }}>¿Identificador?</div>
           </div>
           <div style={{ border: '1px solid var(--color-border)', borderTop: 'none', borderRadius: '0 0 var(--radius-md) var(--radius-md)' }}>
              {(activeTab === 'mappings_contacts' ? kommoContactFields : kommoLeadFields).map(kf => {
                 const currentMapping = mappings.find(m => m.kommo_entity === (activeTab === 'mappings_contacts' ? 'contacts' : 'leads') && m.kommo_field_id === kf.id.toString());
                 
                 return (
                 <div key={kf.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: '1rem', padding: '1rem', borderBottom: '1px solid var(--color-border)', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.875rem' }}>{kf.name} <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>(#{kf.id})</span></div>
                    <div>
                       <select 
                          className="form-input" 
                          value={currentMapping?.local_field || ''}
                          onChange={(e) => handleMappingChange(activeTab === 'mappings_contacts' ? 'contacts' : 'leads', kf, e.target.value)}
                       >
                          <option value="">-- No Importar --</option>
                          <optgroup label="Campos Principales">
                             {localFields.filter(f => f.type === 'fixed' && f.group === 'Campos Principales' && f.entity === (activeTab === 'mappings_contacts' ? 'contacts' : 'leads')).map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                             ))}
                          </optgroup>
                          <optgroup label="Campos Base">
                             {localFields.filter(f => f.type === 'fixed' && f.group === 'Campos Base' && f.entity === (activeTab === 'mappings_contacts' ? 'contacts' : 'leads')).map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                             ))}
                          </optgroup>
                          <optgroup label="Campos Personalizados">
                             {localFields.filter(f => f.type === 'json').map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                             ))}
                          </optgroup>
                       </select>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                       {currentMapping && activeTab === 'mappings_contacts' && (
                          <input 
                             type="checkbox" 
                             checked={currentMapping.is_identifier || false}
                             onChange={(e) => handleIdentifierChange('contacts', kf.id.toString(), e.target.checked)}
                             title="Usar para detectar duplicados (ej: CPF o Email)"
                             style={{ cursor: 'pointer', width: '1.2rem', height: '1.2rem' }}
                          />
                       )}
                    </div>
                 </div>
              )})}
              {(activeTab === 'mappings_contacts' ? kommoContactFields : kommoLeadFields).length === 0 && (
                 <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    No se encontraron campos. Asegúrate de tener conexión y campos creados en Kommo.
                 </div>
              )}
           </div>
        </div>
      )}

      {activeTab === 'mappings_stages' && (
        <div style={{ background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                 <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem' }}>Mapeo de Etapas</h3>
                 <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                    Cada pipeline de Kommo tiene sus propias columnas. Marcá "Activa registro" en la etapa donde
                    querés que se cree el cliente y el trámite si todavía no existen — las demás columnas solo
                    actualizan un trámite que ya exista, sin disparar un alta nueva.
                 </p>
              </div>
              <button className="btn btn-primary" onClick={saveStageMappings} disabled={saving}>
                 {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                 <span style={{ marginLeft: '4px' }}>Guardar Mapeo</span>
              </button>
           </div>

           {kommoPipelines.map(pipeline => (
              <div key={pipeline.id} style={{ marginBottom: '1.5rem' }}>
                 <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>{pipeline.name}</h4>
                 <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '1rem', padding: '0.5rem 1rem', background: 'var(--color-bg-elevated)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                       <div>Etapa</div>
                       <div style={{ textAlign: 'center' }}>Activa registro</div>
                    </div>
                    {pipeline.stages.map(stage => {
                       const current = stageMappings.find(m => m.kommo_pipeline_id === pipeline.id.toString() && m.kommo_stage_id === stage.id.toString());
                       return (
                          <div key={stage.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '1rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border)', alignItems: 'center' }}>
                             <div style={{ fontSize: '0.875rem' }}>{stage.name}</div>
                             <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <input
                                   type="checkbox"
                                   checked={current?.activa_registro || false}
                                   onChange={(e) => handleStageActivaRegistroChange(pipeline, stage, e.target.checked)}
                                   title="Crear cliente y trámite acá si todavía no existen"
                                   style={{ cursor: 'pointer', width: '1.2rem', height: '1.2rem' }}
                                />
                             </div>
                          </div>
                       );
                    })}
                 </div>
              </div>
           ))}

           {kommoPipelines.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                 No se encontraron pipelines. Asegúrate de tener conexión con Kommo.
              </div>
           )}
        </div>
      )}
    </div>
  );
}
