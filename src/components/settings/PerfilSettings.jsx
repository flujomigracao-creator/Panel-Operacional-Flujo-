import React, { useState, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { Save, Loader2, User, Camera } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PerfilSettings({ userProfile }) {
    const [nombre, setNombre] = useState(userProfile?.nombre || '');
    const [avatarUrl, setAvatarUrl] = useState(userProfile?.avatar_url || '');
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    React.useEffect(() => {
        if (userProfile) {
            setNombre(userProfile.nombre || '');
            setAvatarUrl(userProfile.avatar_url || '');
        }
    }, [userProfile]);

    const handleSave = async () => {
        if (!nombre.trim()) {
            toast.error('El nombre no puede estar vacío');
            return;
        }

        setSaving(true);
        try {
            const { error } = await supabase
                .from('perfiles')
                .update({ nombre: nombre.trim(), avatar_url: avatarUrl })
                .eq('id', userProfile.id)
                .select()
                .single();

            if (error) {
                // Si falla porque no existe la columna avatar_url, intentamos solo con el nombre
                if (error.message && error.message.includes('avatar_url')) {
                    const { error: fallbackError } = await supabase
                        .from('perfiles')
                        .update({ nombre: nombre.trim() })
                        .eq('id', userProfile.id)
                        .select()
                        .single();
                    
                    if (fallbackError) {
                        if (fallbackError.code === 'PGRST116') {
                            throw new Error("Permisos insuficientes en la base de datos (RLS) para actualizar tu perfil.");
                        }
                        throw fallbackError;
                    }
                    toast.success('Nombre actualizado (Nota: La columna avatar_url no existe en la base de datos).');
                    return;
                }
                
                if (error.code === 'PGRST116') {
                    throw new Error("Permisos insuficientes en la base de datos (RLS) para actualizar tu perfil.");
                }
                throw error;
            }
            
            toast.success('Perfil actualizado correctamente. Recarga para ver los cambios en todo el sistema.');
        } catch (error) {
            console.error('Error saving profile:', error);
            toast.error(`Error al actualizar: ${error.message || error.details || 'Desconocido'}`);
        } finally {
            setSaving(false);
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Por favor, selecciona una imagen válida');
            return;
        }

        setUploading(true);
        try {
            const ext = file.name.split('.').pop().toLowerCase();
            const uniqueName = `avatar_${userProfile.id}_${Date.now()}.${ext}`;
            const storagePath = `avatars/${uniqueName}`;

            // Subimos la imagen al bucket documentos_operacionales
            const { error: uploadError } = await supabase.storage
                .from('documentos_operacionales')
                .upload(storagePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('documentos_operacionales')
                .getPublicUrl(storagePath);

            setAvatarUrl(urlData.publicUrl);
            toast.success('Imagen subida correctamente. No olvides guardar los cambios.');
        } catch (error) {
            console.error('Error uploading image:', error);
            toast.error('Error al subir la imagen');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <User size={24} color="var(--color-primary)" />
                    Mi Perfil
                </h2>
                <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
                    Actualiza tu información personal y foto de perfil.
                </p>
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                    
                    {/* Foto de perfil */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '120px', height: '120px', borderRadius: '50%', background: 'var(--color-bg-elevated)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--color-border)',
                            overflow: 'hidden', position: 'relative'
                        }}>
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <User size={48} color="var(--color-text-muted)" />
                            )}
                            
                            {uploading && (
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Loader2 size={24} color="white" className="animate-spin" />
                                </div>
                            )}
                        </div>
                        
                        <input 
                            type="file" 
                            accept="image/*" 
                            style={{ display: 'none' }} 
                            ref={fileInputRef} 
                            onChange={handleImageUpload} 
                        />
                        
                        <button 
                            className="btn btn-secondary btn-sm"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Camera size={14} /> Cambiar foto
                        </button>
                    </div>

                    {/* Datos del usuario */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                Correo Electrónico
                            </label>
                            <input
                                type="email"
                                value={userProfile?.email || ''}
                                disabled
                                className="form-input"
                                style={{ maxWidth: '400px', background: 'var(--color-bg-canvas)', color: 'var(--color-text-muted)' }}
                            />
                            <small style={{ color: 'var(--color-text-muted)' }}>El correo electrónico no se puede cambiar aquí.</small>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                Nombre Completo
                            </label>
                            <input
                                type="text"
                                value={nombre}
                                onChange={(e) => setNombre(e.target.value)}
                                placeholder="Tu nombre"
                                className="form-input"
                                style={{ maxWidth: '400px' }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                Rol
                            </label>
                            <input
                                type="text"
                                value={userProfile?.rol === 'admin' ? 'Administrador' : 'Miembro del Equipo'}
                                disabled
                                className="form-input"
                                style={{ maxWidth: '200px', background: 'var(--color-bg-canvas)', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}
                            />
                        </div>

                        <div style={{ marginTop: '1rem' }}>
                            <button 
                                className="btn btn-primary" 
                                onClick={handleSave}
                                disabled={saving}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Guardar Cambios
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
