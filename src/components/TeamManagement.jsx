import React, { useState, useEffect } from 'react';
import { getPerfiles, createTeamMember, updateUserRole } from '../services/equipoService';
import { Shield, UserPlus, Mail, Lock, User, Plus, ShieldAlert, Loader2 } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

export default function TeamManagement({ userProfile }) {
  const [perfiles, setPerfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states
  const [_email, _setEmail] = useState('');
  const [_password, _setPassword] = useState('');
  const [_nombre, _setNombre] = useState('');
  const [_rol, _setRol] = useState('miembro');
  const [_saving, _setSaving] = useState(false);

  // Invitación por email
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  // Permisos
  const currentRole = userProfile?.rol || 'miembro';
  const isSuperAdmin = currentRole === 'admin_plus';

  useEffect(() => {
    loadPerfiles();
  }, []);

  const loadPerfiles = async () => {
    try {
      const data = await getPerfiles();
      setPerfiles(data);
    } catch (error) {
      console.error('Error loading perfiles:', error);
      toast.error('Error al cargar el equipo');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInviteEmail = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Ingresá un email.');
      return;
    }
    setSendingInvite(true);
    try {
      // Crea la cuenta directamente (empresa única, no hay organización a la
      // que "unirse") y le manda un link para poner contraseña.
      const { error } = await supabase.functions.invoke('invite-team-member', {
        body: {
          email: inviteEmail.trim(),
          inviterNombre: userProfile?.nombre,
        },
      });
      if (error) throw error;
      toast.success(`Invitación enviada a ${inviteEmail.trim()}`);
      setInviteEmail('');
      setIsModalOpen(false);
      loadPerfiles();
    } catch (error) {
      console.error('Error enviando invitación por email:', error);
      toast.error('No se pudo enviar el email: ' + error.message);
    } finally {
      setSendingInvite(false);
    }
  };

  const handleChangeRole = async (userId, newRole) => {
    try {
      await updateUserRole(userId, newRole);
      setPerfiles(perfiles.map(p => p.id === userId ? { ...p, rol: newRole } : p));
      toast.success('Rol actualizado correctamente');
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Error al actualizar el rol');
    }
  };

  const canEditRole = (targetRole) => {
    if (isSuperAdmin) return true; // admin_plus puede editar a todos
    if (currentRole === 'admin') {
        // admin normal NO puede editar a un admin_plus
        if (targetRole === 'admin_plus') return false;
        return true; // Puede editar miembros y otros admins
    }
    return false;
  };

  const renderRoleBadge = (r) => {
    if (r === 'admin_plus') {
      return (
        <span style={{ 
          display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', 
          borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 500,
          background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6'
        }}>
          <ShieldAlert size={12} /> ADMIN PLUS
        </span>
      );
    }
    if (r === 'admin') {
      return (
        <span style={{ 
          display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', 
          borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 500,
          background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6'
        }}>
          <Shield size={12} /> ADMINISTRADOR
        </span>
      );
    }
    return (
      <span style={{ 
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', 
        borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 500,
        background: 'rgba(16, 185, 129, 0.1)', color: '#10b981'
      }}>
        <User size={12} /> MIEMBRO
      </span>
    );
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><LoadingSpinner /></div>;

  return (
    <div style={{ padding: '1.5rem 2rem', background: 'var(--color-bg-canvas)', height: '100%', overflowY: 'auto' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>Gestión de Equipo</h1>
            <p style={{ color: 'var(--color-text-secondary)', margin: '0.5rem 0 0 0' }}>
              Administra los miembros de tu equipo operativo
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setIsModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <UserPlus size={18} /> Invitar Miembro
          </button>
        </div>

        <div style={{ background: 'var(--color-bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)' }}>
              <tr>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Usuario</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Email</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Rol Actual</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Cambiar Rol</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Registro</th>
              </tr>
            </thead>
            <tbody>
              {perfiles.map((perfil) => (
                <tr key={perfil.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--color-bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-primary)', fontWeight: 600, fontSize: '0.875rem' }}>
                      {perfil.nombre.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{perfil.nombre}</span>
                  </td>
                  <td style={{ padding: '1rem', color: 'var(--color-text-secondary)' }}>{perfil.email || 'N/A'}</td>
                  <td style={{ padding: '1rem' }}>
                    {renderRoleBadge(perfil.rol)}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {canEditRole(perfil.rol) && perfil.id !== userProfile?.id ? (
                      <select 
                        className="form-input" 
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', height: 'auto' }}
                        value={perfil.rol}
                        onChange={(e) => handleChangeRole(perfil.id, e.target.value)}
                      >
                        <option value="miembro">Miembro</option>
                        <option value="admin">Administrador</option>
                        {isSuperAdmin && <option value="admin_plus">Admin Plus</option>}
                      </select>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {perfil.id === userProfile?.id ? '(Tú)' : 'Sin permisos'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    {new Date(perfil.creado_en).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--color-bg-surface)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '450px', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--color-text-primary)', fontSize: '1.25rem', fontWeight: 600 }}>Invitar Miembro al Equipo</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
              Le creamos la cuenta y le mandamos un email para que ponga su contraseña.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Email</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="email"
                    placeholder="email@ejemplo.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', fontSize: '0.875rem' }}
                  />
                  <button
                    type="button"
                    onClick={handleSendInviteEmail}
                    disabled={sendingInvite}
                    className="btn btn-primary"
                    style={{ padding: '0.75rem 1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    {sendingInvite ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                    Enviar
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 500 }}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
