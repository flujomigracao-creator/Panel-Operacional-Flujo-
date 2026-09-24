import React, { useState, useEffect } from 'react';
import { Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { getConfig, setConfig } from '../../services/configService';
import { useSession } from '../../hooks/useSession';
import toast from 'react-hot-toast';

export default function IntegracionesSettings() {
    const { session } = useSession();
    const [formularios, setFormularios] = useState([{ id: Date.now(), name: 'Sisconare', url: '' }]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const data = await getConfig('formularios_externos_links');
                if (data) {
                    try {
                        const parsed = JSON.parse(data);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            setFormularios(parsed);
                        }
                    } catch (e) {
                        console.error('Error parsing formularios_externos_links', e);
                    }
                } else {
                    // Fallback to old tally_base_url if forms array doesn't exist
                    const oldUrl = await getConfig('tally_base_url');
                    if (oldUrl) {
                        setFormularios([{ id: Date.now(), name: 'Sisconare', url: oldUrl }]);
                    }
                }
            } catch (error) {
                console.error('Error fetching config:', error);
                toast.error('Error al cargar configuración');
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleSave = async () => {
        // Validate
        const invalid = formularios.some(f => !f.name.trim() || !f.url.trim());
        if (invalid) {
            toast.error('Todos los formularios deben tener un nombre y una URL');
            return;
        }

        setSaving(true);
        try {
            await setConfig('formularios_externos_links', JSON.stringify(formularios), session?.user?.id);
            toast.success('Configuración guardada correctamente');
        } catch (error) {
            console.error('Error saving config:', error);
            toast.error('Error al guardar configuración');
        } finally {
            setSaving(false);
        }
    };

    const addFormulario = () => {
        setFormularios([...formularios, { id: Date.now(), name: '', url: '' }]);
    };

    const removeFormulario = (id) => {
        setFormularios(formularios.filter(f => f.id !== id));
    };

    const updateFormulario = (id, field, value) => {
        setFormularios(formularios.map(f => f.id === id ? { ...f, [field]: value } : f));
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <Loader2 className="animate-spin" size={24} color="var(--color-primary)" />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem' }}>Formularios Tally Externos</h3>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', lineHeight: '1.5', maxWidth: '600px' }}>
                            Define múltiples enlaces de Tally para enviarle a los clientes. 
                            El sistema añadirá automáticamente <code style={{background: 'var(--color-bg-canvas)', padding: '2px 6px', borderRadius: '4px'}}>?cliente_id=...</code> al final de cada enlace copiado.
                        </p>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={addFormulario} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Plus size={16} /> Añadir Formulario
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                    {formularios.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                            No hay formularios configurados
                        </div>
                    ) : (
                        formularios.map((form) => (
                            <div key={form.id} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', background: 'var(--color-bg-canvas)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Nombre del botón</label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => updateFormulario(form.id, 'name', e.target.value)}
                                        placeholder="Ej: Sisconare"
                                        className="form-input"
                                    />
                                </div>
                                <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>URL Base (Tally)</label>
                                    <input
                                        type="url"
                                        value={form.url}
                                        onChange={(e) => updateFormulario(form.id, 'url', e.target.value)}
                                        placeholder="ej: https://tally.so/r/mYfoRm"
                                        className="form-input"
                                    />
                                </div>
                                <div style={{ paddingTop: '1.5rem' }}>
                                    <button 
                                        className="btn btn-ghost btn-sm" 
                                        onClick={() => removeFormulario(form.id)}
                                        title="Eliminar"
                                        style={{ color: 'var(--color-danger)' }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <button 
                    className="btn btn-primary" 
                    onClick={handleSave}
                    disabled={saving}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Guardar Configuración
                </button>
            </div>
        </div>
    );
}
