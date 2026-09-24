import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Loader2, Save, LayoutTemplate } from 'lucide-react';
import toast from 'react-hot-toast';
import { getConfigCamposClientes } from '../../services/clientesService';

const LOCAL_FIXED_FIELDS = [
  { id: 'cpf', name: 'CPF' },
  { id: 'telefono', name: 'Teléfono' },
  { id: 'email', name: 'Email' },
  { id: 'origen', name: 'Origen (Ciudad/Estado/Nacionalidad)' },
  { id: 'creado_en', name: 'Fecha de Registro' },
  { id: 'carnet_identidad', name: 'Carnet de Identidad (RG)' },
  { id: 'id_kommo', name: 'ID Kommo' },
];

export default function HeaderSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [empresaId, setEmpresaId] = useState(null);

  // Local Fields
  const [localFields, setLocalFields] = useState([]);
  
  // Selected Fields
  const [selectedFields, setSelectedFields] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // 1. Load Local (fixed) fields + campos personalizados dinámicos —
      // estos últimos ya se leen bien en ClientViewHeader (campos_personalizados
      // JSONB), solo faltaba poder elegirlos acá.
      const fixedFields = LOCAL_FIXED_FIELDS.map(f => ({ ...f, type: 'fixed', group: 'Campos Principales' }));
      const customFields = await getConfigCamposClientes();
      const customFieldsMapped = customFields.map(cf => ({
        id: cf.identificador,
        name: cf.nombre_campo,
        type: 'custom',
        group: cf.categoria || 'Campos Personalizados',
      }));
      setLocalFields([...fixedFields, ...customFieldsMapped]);

      // 2. Load Selected Configuration (empresa única, sin multi-tenant: fila
      // única de `configuracion_empresa`, igual que OrganizationContext/marcaService.js)
      const { data: empresaData } = await supabase
        .from('configuracion_empresa')
        .select('id, config_cabecera_cliente')
        .limit(1)
        .maybeSingle();

      setEmpresaId(empresaData?.id ?? null);
      if (empresaData && empresaData.config_cabecera_cliente) {
        setSelectedFields(empresaData.config_cabecera_cliente);
      } else {
        setSelectedFields(['telefono', 'email']);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar la configuración de la cabecera');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleField = (fieldId) => {
    setSelectedFields(prev => {
      if (prev.includes(fieldId)) {
        return prev.filter(id => id !== fieldId);
      } else {
        if (prev.length >= 8) {
          toast.error('Máximo 8 campos permitidos en la cabecera');
          return prev;
        }
        return [...prev, fieldId];
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!empresaId) throw new Error('No se encontró la fila de configuracion_empresa para actualizar.');
      await supabase.from('configuracion_empresa').update({ config_cabecera_cliente: selectedFields }).eq('id', empresaId);
      toast.success('Configuración guardada correctamente. Recarga la página de clientes para ver los cambios.');
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="animate-spin" /> Cargando configuración...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
           <h2 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem 0', color: 'var(--color-text-primary)' }}>Cabecera del Cliente</h2>
           <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Selecciona qué datos quieres ver a simple vista en la barra superior al abrir un cliente. (Máx 8)</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
           {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} 
           <span style={{ marginLeft: '4px' }}>Guardar</span>
        </button>
      </div>

      <div style={{ background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><LayoutTemplate size={18}/> Campos Disponibles</h3>

        {['Campos Principales', ...[...new Set(localFields.map(f => f.group))].filter(g => g !== 'Campos Principales')].map(group => {
           const groupFields = localFields.filter(f => f.group === group);
           if (groupFields.length === 0) return null;
           return (
              <div key={group} style={{ marginBottom: '1.5rem' }}>
                 <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group}</h4>
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.75rem' }}>
                    {groupFields.map(field => (
                       <label key={field.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', background: 'var(--color-bg-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                          <input 
                             type="checkbox" 
                             checked={selectedFields.includes(field.id)} 
                             onChange={() => handleToggleField(field.id)}
                             style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>{field.name}</span>
                       </label>
                    ))}
                 </div>
              </div>
           );
        })}
      </div>
    </div>
  );
}
