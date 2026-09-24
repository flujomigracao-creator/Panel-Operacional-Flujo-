import React from 'react';
import { AlertTriangle, Loader2, Trash2, Sparkles, Edit2, PenTool, Copy, Check, Smartphone, Key, RefreshCw } from 'lucide-react';
import { formatDate } from '../utils/dateFormatter';

export default function ClientViewHeader({
  client,
  duplicateContacts = [],
  setShowMergeModal,
  handleDeleteClient,
  isDeleting,
  isAiChatOpen,
  setIsAiChatOpen,
  handleSendToExtension,
  openEditModal,
  openSignatureModal,
  configCabecera,
  clienteDatos = [],
  campos = [],
  handleCopy,
  copiedId,
  portalCredentials,
  onGeneratePassword,
  onGenerateNumero,
  portalLoading,
}) {
  const fieldsToRender = configCabecera || ['telefono', 'email'];

  const getFieldLabel = (fieldId) => {
     if (fieldId === 'cpf') return 'CPF';
     if (fieldId === 'email') return 'Email';
     if (fieldId === 'telefono') return 'Tel';
     if (fieldId === 'origen') return 'Origen';
     if (fieldId === 'creado_en') return 'Registrado';
     if (fieldId === 'carnet_identidad') return 'RG/ID';
     if (fieldId === 'id_kommo') return 'Kommo ID';
     const customField = campos.find(c => c.identificador === fieldId);
     return customField ? customField.nombre_campo : fieldId;
  };

  const getFieldValue = (fieldId) => {
     if (fieldId === 'origen') return `${client.ciudad || 'DESC'}, ${client.estado_federal || client.estado || 'N/A'}, ${client.nacionalidad || 'N/A'}`;
     if (fieldId === 'creado_en') return client.creado_en ? formatDate(client.creado_en) : 'N/A';

     // 1. Campos personalizados (JSON): campos dinámicos nuevos creados desde
     //    Configuración > Campos Base (config_campos_clientes), sin columna propia.
     if (client.campos_personalizados && client.campos_personalizados[fieldId]) {
         return client.campos_personalizados[fieldId];
     }

     // 2. Columna directa del cliente (los 13 campos migratorios + el resto de columnas fijas)
     if (client[fieldId]) return client[fieldId];

     // 3. Campos dinámicos (compatibilidad con `clienteDatos`, si algún llamador lo pasa)
     const dynamic = clienteDatos.find(d => d.campo_id === fieldId);
     if (dynamic && dynamic.valor) return dynamic.valor;

     return 'N/A';
  };
  return (
    <div className="glass-panel" style={{ padding: 'var(--card-padding, 14px 16px)', marginBottom: 'var(--section-gap, 16px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: 'var(--gap-md, 12px)', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 'var(--gap-md, 12px)', alignItems: 'center', minWidth: 0 }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 700, color: 'white', position: 'relative', flexShrink: 0 }}>
          {client.nombre?.split(' ').map(n => n[0]).join('').substring(0, 2)}
          {duplicateContacts.length > 1 && (
            <button
              onClick={() => setShowMergeModal(true)}
              style={{
                position: 'absolute', top: '-5px', right: '-5px', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--color-info)', border: '2px solid var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', animation: 'pulse 2s infinite', zIndex: 10
              }}
              title="¡Cliente duplicado! Haz clic para fusionar"
              aria-label="Fusionar clientes duplicados"
            >
              <AlertTriangle size={12} color="white" />
            </button>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ font: 'var(--font-page-title)', margin: '0 0 0.25rem', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.nombre}</span>
            {handleCopy && (
              <button
                onClick={() => handleCopy(client.nombre || '', 'nombre-completo')}
                className="btn btn-ghost"
                style={{ padding: '0.25rem', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
                title="Copiar nombre completo"
              >
                {copiedId === 'nombre-completo' ? <Check size={14} color="var(--color-success)" /> : <Copy size={14} />}
              </button>
            )}
          </h1>
          <div style={{ display: 'flex', gap: '0.6rem', color: 'var(--color-text-secondary)', fontSize: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {fieldsToRender
              .map(fieldId => ({ fieldId, label: getFieldLabel(fieldId), value: getFieldValue(fieldId) }))
              .filter(f => f.value !== 'N/A')
              .map((f, index) => (
                  <React.Fragment key={f.fieldId}>
                    {index > 0 && <span>•</span>}
                    <span><span style={{ color: 'var(--color-text-muted)' }}>{f.label}:</span> {f.value}</span>
                  </React.Fragment>
              ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={handleDeleteClient} disabled={isDeleting} style={{ color: 'var(--color-danger)' }}>
          {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          <span style={{ marginLeft: '4px' }}>Eliminar</span>
        </button>
        <button className="btn btn-secondary" onClick={() => setIsAiChatOpen(!isAiChatOpen)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sparkles size={16} />
          {isAiChatOpen ? 'Cerrar Chat' : 'Asistente IA'}
        </button>
        <button className="btn btn-secondary" onClick={handleSendToExtension} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(23,198,113,0.1)', color: 'var(--color-success)', borderColor: 'rgba(23,198,113,0.2)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
          Enviar a Extensión
        </button>
        <button className="btn btn-secondary" onClick={openSignatureModal} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0055ff', borderColor: 'rgba(0,85,255,0.2)' }}>
          <PenTool size={16} />
          Extraer Firma
        </button>
        <button className="btn btn-secondary" onClick={() => openEditModal && openEditModal('ALL_PERSONAL')}><Edit2 size={16} /> Editar Datos</button>
      </div>

      {/* ── Portal de Clientes — Panel de Credenciales ── */}
      {portalCredentials !== undefined && (
        <div style={{
          width: '100%',
          marginTop: '0.75rem',
          padding: '0.625rem 0.875rem',
          background: 'rgba(29,78,216,0.06)',
          border: '1px solid rgba(29,78,216,0.15)',
          borderRadius: 'var(--radius-sm, 6px)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          flexWrap: 'wrap',
          fontSize: '0.8rem',
        }}>
          <Smartphone size={16} color="#1D4ED8" style={{ flexShrink: 0 }} />
          <span style={{ fontWeight: 600, color: '#1D4ED8' }}>App Clientes</span>
          <span style={{ color: 'var(--color-text-muted)' }}>•</span>

          {/* Número de cliente */}
          {portalCredentials?.numero_cliente ? (
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {portalCredentials.numero_cliente}
            </span>
          ) : (
            <button
              className="btn btn-ghost"
              onClick={onGenerateNumero}
              disabled={portalLoading}
              style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', gap: '0.25rem' }}
            >
              {portalLoading ? <Loader2 size={12} className="animate-spin" /> : <Key size={12} />}
              Generar N°
            </button>
          )}

          {/* Clave de acceso */}
          {portalCredentials?.clave_acceso ? (
            <>
              <span style={{ color: 'var(--color-text-muted)' }}>•</span>
              <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                Clave: <strong>{portalCredentials.clave_acceso}</strong>
              </span>
            </>
          ) : null}

          {/* Botones de acción */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.375rem' }}>
            <button
              className="btn btn-ghost"
              onClick={onGeneratePassword}
              disabled={portalLoading}
              title="Generar nueva contraseña"
              style={{ padding: '0.2rem 0.4rem' }}
            >
              <RefreshCw size={13} />
            </button>

            {portalCredentials?.numero_cliente && portalCredentials?.clave_acceso && handleCopy && (
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const msg = `🔑 *Acceso App PCBR*\n\n📱 Número de Cliente: *${portalCredentials.numero_cliente}*\n🔐 Contraseña: *${portalCredentials.clave_acceso}*\n\n👉 Ingresa a la App: [link]\n\n_Tu acceso es personal, no lo compartas._`;
                  handleCopy(msg, 'portal-msg');
                }}
                title="Copiar mensaje de credenciales"
                style={{ padding: '0.2rem 0.4rem' }}
              >
                {copiedId === 'portal-msg' ? <Check size={13} color="var(--color-success)" /> : <Copy size={13} />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
