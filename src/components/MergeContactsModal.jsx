import React, { useState, useEffect } from 'react';
import { X, User, Phone, Mail, Copy, Check } from 'lucide-react';
import { mergeContacts } from '../services/mergeService';

const commonFields = [
    { id: 'nombre', label: 'Nombre', icon: User },
    { id: 'telefono', label: 'Teléfono', icon: Phone },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'cpf', label: 'CPF' },
    { id: 'carnet_identidad', label: 'Carnet de Identidad', dynamic: true },
    { id: 'fecha_nacimiento', label: 'Fecha de Nacimiento' },
    { id: 'estado_civil', label: 'Estado Civil' },
    { id: 'sexo', label: 'Sexo' },
    { id: 'nacionalidad', label: 'Nacionalidad' },
    { id: 'pais', label: 'País' },
    { id: 'lugar_nacimiento', label: 'Lugar de Nacimiento' },
    { id: 'estado_federal', label: 'Estado Federal' },
    { id: 'ciudad', label: 'Ciudad' },
    { id: 'direccion', label: 'Dirección' },
    { id: 'rnm', label: 'RNM', dynamic: true },
    { id: 'numero_pasaporte', label: 'Número Pasaporte', dynamic: true },
    { id: 'fecha_emision_pasaporte', label: 'Fecha Emisión Pasaporte', dynamic: true },
    { id: 'fecha_vencimiento_pasaporte', label: 'Fecha Vencimiento Pasaporte', dynamic: true },
    { id: 'numero_refugio', label: 'Número Refugio', dynamic: true },
    { id: 'fecha_vencimiento_refugio', label: 'Fecha Vencimiento Refugio', dynamic: true },
    { id: 'nombre_madre', label: 'Nombre Madre', dynamic: true },
    { id: 'nombre_padre', label: 'Nombre Padre', dynamic: true },
];

// Los campos marcados `dynamic: true` viven en clientes.campos_personalizados
// (JSONB) en vez de una columna real — ver clientView.constants.js.
const fieldValue = (contact, fieldId) => {
    const field = commonFields.find(f => f.id === fieldId);
    return field?.dynamic ? contact?.campos_personalizados?.[fieldId] : contact?.[fieldId];
};

const MergeContactsModal = ({ isOpen, onClose, contact1, contact2, onMergeComplete }) => {
    const [copiedId, setCopiedId] = useState(null);
    const [selectedContact, setSelectedContact] = useState('contact1');
    const [mergeData, setMergeData] = useState({});
    const [selectedSources, setSelectedSources] = useState({});

    useEffect(() => {
        if (contact1 && contact2) {
            const initialSources = {};
            const initialMergeData = {};
            
            commonFields.forEach(field => {
                const id = field.id;
                if (fieldValue(contact1, id)) {
                    initialSources[id] = 'contact1';
                    initialMergeData[id] = fieldValue(contact1, id);
                } else if (fieldValue(contact2, id)) {
                    initialSources[id] = 'contact2';
                    initialMergeData[id] = fieldValue(contact2, id);
                } else {
                    initialSources[id] = null;
                    initialMergeData[id] = '';
                }
            });
            
            setSelectedSources(initialSources);
            setMergeData(initialMergeData);
        }
    }, [contact1, contact2]);

    const handleCopy = (text, id) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleSelectField = (field, contactSource) => {
        const sourceContact = contactSource === 'contact1' ? contact1 : contact2;
        setSelectedSources(prev => ({
            ...prev,
            [field]: contactSource
        }));
        setMergeData(prev => ({
            ...prev,
            [field]: fieldValue(sourceContact, field) || ''
        }));
    };

    const handleMerge = async () => {
        const contactToKeep = selectedContact === 'contact1' ? contact1 : contact2;
        const contactToDelete = selectedContact === 'contact1' ? contact2 : contact1;

        // Limpiar los datos vacíos antes de enviar a Supabase (convertir '' a null para campos de fecha)
        const cleanedData = {};
        for (const key in mergeData) {
            cleanedData[key] = mergeData[key] === '' ? null : mergeData[key];
        }

        const result = await mergeContacts(contactToKeep.id, contactToDelete.id, cleanedData);

        if (result.success) {
            onMergeComplete(cleanedData, contactToKeep.id);
        } else {
            console.error('Error en la fusión de contactos:', result.error);
            alert('Error al fusionar contactos: ' + result.error);
        }
    };

    if (!isOpen || !contact1 || !contact2) return null;

    const getBtnStyle = (contactSource, fieldId) => {
        const sourceContact = contactSource === 'contact1' ? contact1 : contact2;
        const contactValue = fieldValue(sourceContact, fieldId);
        const isSelected = selectedSources[fieldId] === contactSource;
        
        return {
            padding: '4px 8px',
            fontSize: '0.75rem',
            background: isSelected ? 'var(--color-success)' : 'var(--surface-elevated)',
            color: isSelected ? '#fff' : 'var(--text-primary)',
            border: '1px solid ' + (isSelected ? 'var(--color-success)' : 'var(--border-default)'),
            opacity: !contactValue ? 0.5 : 1,
            cursor: 'pointer',
            borderRadius: 'var(--radius-sm)',
            transition: 'all 0.2s'
        };
    };

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px', backdropFilter: 'blur(4px)' }}>
            <div className="glass-panel-elevated" style={{ width: '100%', maxWidth: '1152px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>Fusión de Contactos</h2>
                    <button onClick={onClose} className="btn btn-ghost" style={{ padding: '8px' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <button
                            onClick={() => setSelectedContact('contact1')}
                            className={`btn ${selectedContact === 'contact1' ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '8px 16px' }}
                        >
                            Contacto Principal (Mantener)
                        </button>
                        <button
                            onClick={() => setSelectedContact('contact2')}
                            className={`btn ${selectedContact === 'contact2' ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '8px 16px' }}
                        >
                            Contacto Secundario (Eliminar)
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) auto minmax(250px, 1fr)', gap: '24px', overflowX: 'auto' }}>
                        {/* Contact 1 */}
                        <div className="glass-panel" style={{ padding: '16px', background: 'var(--surface-base)' }}>
                            <h3 style={{ fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                                <User size={16} /> Contacto 1: {contact1.nombre || 'Sin nombre'}
                            </h3>
                            {commonFields.map(field => {
                                const IconComponent = field.icon || User;
                                const value = fieldValue(contact1, field.id);
                                if (!value && !mergeData[field.id]) return null;

                                return (
                                    <div key={`contact1-${field.id}`} style={{ marginBottom: '12px', padding: '8px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <IconComponent size={12} style={{ color: 'var(--text-secondary)' }} />
                                            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{field.label}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{value || 'Vacío'}</span>
                                            <button
                                                onClick={() => handleCopy(value || '', `contact1-${field.id}`)}
                                                className="btn btn-ghost"
                                                style={{ padding: '4px', minHeight: 'auto' }}
                                            >
                                                {copiedId === `contact1-${field.id}` ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Selection Controls */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ textAlign: 'center', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '16px' }}>Seleccionar datos</div>
                            {commonFields.map(field => {
                                const contact1Value = fieldValue(contact1, field.id);
                                const contact2Value = fieldValue(contact2, field.id);
                                if (!contact1Value && !contact2Value) return null;

                                return (
                                    <div key={`controls-${field.id}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: '16px', width: '100px' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{field.label}</div>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button
                                                onClick={() => handleSelectField(field.id, 'contact1')}
                                                style={getBtnStyle('contact1', field.id)}
                                                disabled={!contact1Value}
                                            >C1</button>
                                            <button
                                                onClick={() => handleSelectField(field.id, 'contact2')}
                                                style={getBtnStyle('contact2', field.id)}
                                                disabled={!contact2Value}
                                            >C2</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Contact 2 */}
                        <div className="glass-panel" style={{ padding: '16px', background: 'var(--surface-base)' }}>
                            <h3 style={{ fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                                <User size={16} /> Contacto 2: {contact2.nombre || 'Sin nombre'}
                            </h3>
                            {commonFields.map(field => {
                                const IconComponent = field.icon || User;
                                const value = fieldValue(contact2, field.id);
                                if (!value && !mergeData[field.id]) return null;

                                return (
                                    <div key={`contact2-${field.id}`} style={{ marginBottom: '12px', padding: '8px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <IconComponent size={12} style={{ color: 'var(--text-secondary)' }} />
                                            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{field.label}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{value || 'Vacío'}</span>
                                            <button
                                                onClick={() => handleCopy(value || '', `contact2-${field.id}`)}
                                                className="btn btn-ghost"
                                                style={{ padding: '4px', minHeight: 'auto' }}
                                            >
                                                {copiedId === `contact2-${field.id}` ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Preview of merged data */}
                    <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '24px' }}>
                        <h3 style={{ fontWeight: 600, marginBottom: '16px', fontSize: '1.125rem' }}>Resultado de la Fusión</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                            {commonFields.map(field => {
                                const value = mergeData[field.id] || '';

                                return (
                                    <div key={`merged-${field.id}`} style={{ padding: '12px', background: 'var(--color-info-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-info-border)' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-info)', marginBottom: '4px' }}>{field.label}</div>
                                        <input 
                                            type="text"
                                            value={value}
                                            onChange={(e) => {
                                                setMergeData(prev => ({...prev, [field.id]: e.target.value}));
                                                setSelectedSources(prev => ({...prev, [field.id]: 'custom'}));
                                            }}
                                            style={{ 
                                                width: '100%', 
                                                fontSize: '0.875rem', 
                                                color: 'var(--text-primary)',
                                                background: 'transparent',
                                                border: 'none',
                                                borderBottom: '1px solid var(--color-info-border)',
                                                padding: '4px 0',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div style={{ padding: '24px', borderTop: '1px solid var(--border-default)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button onClick={onClose} className="btn btn-secondary" style={{ padding: '8px 16px' }}>
                        Cancelar
                    </button>
                    <button onClick={handleMerge} className="btn btn-danger" style={{ padding: '8px 16px' }}>
                        Fusionar Contactos
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MergeContactsModal;