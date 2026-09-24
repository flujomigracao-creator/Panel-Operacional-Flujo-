import React, { useState, useRef, useEffect } from 'react';
import { Palette, Save, Loader2, Image as ImageIcon, RotateCcw, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useOrganization } from '../../context/OrganizationContext';
import { useTheme } from '../../context/ThemeContext';
import { uploadLogo, updateMarca } from '../../services/marcaService';
import { analyzeLogoColors } from '../../services/aiService';

// Coincide con los literales de tokens.css para cada modo, así "Restaurar" siempre
// vuelve al valor por defecto real del tema activo (no a un color hardcodeado fijo).
const DEFAULTS = {
  dark: { primario: '#7c3aed', fondo: '#000000' },
  light: { primario: '#8b5cf6', fondo: '#ffffff' },
};

// Mismo criterio de contraste que aplica OrganizationContext al guardar: fondo oscuro → texto
// claro, fondo claro → texto oscuro. Se usa acá solo para que la vista previa sea instantánea,
// sin esperar a guardar.
function previewTextColor(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const num = parseInt(full, 16) || 0;
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5 ? '#fafafa' : '#09090b';
}

function ColorSwatchRow({ colors, onPick, current }) {
  if (!colors || colors.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      {colors.map((hex) => (
        <button
          key={hex}
          type="button"
          onClick={() => onPick(hex)}
          title={hex}
          style={{
            width: '28px', height: '28px', borderRadius: '50%', background: hex, cursor: 'pointer',
            border: current?.toLowerCase() === hex.toLowerCase() ? '2px solid var(--color-text-primary)' : '1px solid var(--color-border)',
            padding: 0,
          }}
        />
      ))}
    </div>
  );
}

export default function MarcaSettings() {
  const { logoUrl, colorPrimario, colorFondo, colorTexto, updateBranding } = useOrganization();
  const { theme } = useTheme();
  const defaults = DEFAULTS[theme] || DEFAULTS.dark;

  const [logo, setLogo] = useState(logoUrl || '');
  const [color, setColor] = useState(colorPrimario || defaults.primario);
  const [fondo, setFondo] = useState(colorFondo || defaults.fondo);
  const [texto, setTexto] = useState(colorTexto || previewTextColor(colorFondo || defaults.fondo));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setLogo(logoUrl || '');
    setColor(colorPrimario || defaults.primario);
    setFondo(colorFondo || defaults.fondo);
    setTexto(colorTexto || previewTextColor(colorFondo || defaults.fondo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoUrl, colorPrimario, colorFondo, colorTexto]);

  const handleLogoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecciona una imagen válida');
      return;
    }

    setSuggestions(null);
    setUploading(true);
    try {
      const publicUrl = await uploadLogo(file);
      setLogo(publicUrl);
      toast.success('Logo subido. No olvides guardar los cambios.');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Error al subir el logo: ' + (error.message || 'desconocido'));
      setUploading(false);
      return;
    }
    setUploading(false);

    // Analiza los colores automáticamente al subir el logo, sin que el usuario
    // tenga que pedirlo aparte. Corre en silencio (sin toast): si falla, el
    // usuario igual puede elegir los colores a mano con los selectores de abajo.
    setAnalyzing(true);
    try {
      const result = await analyzeLogoColors(file);
      if (result.colores.length > 0 || result.fondos.length > 0) {
        setSuggestions(result);
      }
    } catch (error) {
      console.error('Error analyzing logo:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMarca({ logoUrl: logo || null, colorPrimario: color, colorFondo: fondo, colorTexto: texto });
      updateBranding({ logoUrl: logo || null, colorPrimario: color, colorFondo: fondo, colorTexto: texto });
      toast.success('Marca actualizada correctamente');
    } catch (error) {
      console.error('Error saving marca:', error);
      toast.error('Error al guardar: ' + (error.message || 'desconocido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Palette size={24} color="var(--color-primary)" />
          Marca
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Personaliza el logo y los colores con los que tu equipo y tus clientes ven la plataforma.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Logo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '120px', height: '120px', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-elevated)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--color-border)',
              overflow: 'hidden', position: 'relative'
            }}>
              {logo ? (
                <img src={logo} alt="Logo de la organización" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <ImageIcon size={40} color="var(--color-text-muted)" />
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
              onChange={handleLogoChange}
            />

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <ImageIcon size={14} /> {logo ? 'Cambiar logo' : 'Subir logo'}
            </button>

            {analyzing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                <Loader2 size={14} className="animate-spin" /> Analizando colores con IA...
              </div>
            )}

            <small style={{ color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: '160px' }}>
              PNG o SVG con fondo transparente funciona mejor.
            </small>
          </div>

          {/* Colores de marca */}
          <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {suggestions && (suggestions.colores.length > 0 || suggestions.fondos.length > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.875rem', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  <Sparkles size={14} color="var(--color-primary)" /> Sugerencias de la IA
                </div>
                {suggestions.colores.length > 0 && (
                  <div>
                    <small style={{ color: 'var(--color-text-muted)' }}>Colores del logo (click para usar como color primario)</small>
                    <div style={{ marginTop: '0.375rem' }}>
                      <ColorSwatchRow colors={suggestions.colores} current={color} onPick={setColor} />
                    </div>
                  </div>
                )}
                {suggestions.fondos.length > 0 && (
                  <div>
                    <small style={{ color: 'var(--color-text-muted)' }}>Fondos sugeridos (click para usar como color de fondo)</small>
                    <div style={{ marginTop: '0.375rem' }}>
                      <ColorSwatchRow colors={suggestions.fondos} current={fondo} onPick={setFondo} />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                Color primario
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ width: '48px', height: '40px', padding: 0, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: 'none' }}
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="form-input"
                  style={{ maxWidth: '140px', fontFamily: 'monospace' }}
                  maxLength={7}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setColor(defaults.primario)}
                  title="Restaurar color por defecto"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                >
                  <RotateCcw size={14} /> Restaurar
                </button>
              </div>
              <small style={{ color: 'var(--color-text-muted)' }}>
                Se usa en botones, enlaces y acentos en toda la plataforma.
              </small>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                Color de fondo
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="color"
                  value={fondo}
                  onChange={(e) => setFondo(e.target.value)}
                  style={{ width: '48px', height: '40px', padding: 0, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: 'none' }}
                />
                <input
                  type="text"
                  value={fondo}
                  onChange={(e) => setFondo(e.target.value)}
                  className="form-input"
                  style={{ maxWidth: '140px', fontFamily: 'monospace' }}
                  maxLength={7}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setFondo(defaults.fondo)}
                  title="Restaurar color por defecto"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                >
                  <RotateCcw size={14} /> Restaurar
                </button>
              </div>
              <small style={{ color: 'var(--color-text-muted)' }}>
                Fondo de toda la plataforma (paneles, tarjetas y superficies incluidos).
              </small>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                Color de letra
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="color"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  style={{ width: '48px', height: '40px', padding: 0, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: 'none' }}
                />
                <input
                  type="text"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  className="form-input"
                  style={{ maxWidth: '140px', fontFamily: 'monospace' }}
                  maxLength={7}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setTexto(previewTextColor(fondo))}
                  title="Recalcular automáticamente según el color de fondo"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                >
                  <RotateCcw size={14} /> Automático
                </button>
              </div>
              <small style={{ color: 'var(--color-text-muted)' }}>
                Color del texto en toda la plataforma. "Automático" lo recalcula según el contraste con el color de fondo elegido arriba.
              </small>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                Vista previa
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: fondo }}>
                <button className="btn" style={{ background: color, color: '#fff', border: 'none' }}>
                  Botón principal
                </button>
                <span style={{ color, fontWeight: 600, fontSize: '0.875rem' }}>Texto de acento</span>
                <span style={{ color: texto, fontSize: '0.875rem' }}>Texto normal</span>
              </div>
            </div>

            <div style={{ marginTop: '0.5rem' }}>
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
