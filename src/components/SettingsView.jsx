import React, { useState } from 'react';
import TramitesSettings from './settings/TramitesSettings';
import OperariosSettings from './settings/OperariosSettings';

import MantenimientoSettings from './settings/MantenimientoSettings';
import IntegrationsHub from './settings/IntegrationsHub';
import PerfilSettings from './settings/PerfilSettings';
import MarcaSettings from './settings/MarcaSettings';
import HeaderSettings from './settings/HeaderSettings';
import EtiquetasSettings from './settings/EtiquetasSettings';
import AiBotBuilder from './settings/AiBotBuilder';
import ImportClientesSettings from './settings/ImportClientesSettings';
import ConfigCamposClientesSettings from './settings/ConfigCamposClientesSettings';
import { Settings as SettingsIcon, FileText, UserSquare, Wand2, Link as LinkIcon, User, Palette, FileJson, LayoutTemplate, Tags, Bot, Upload } from 'lucide-react';

// fluid: true = el panel tiene su propia tabla/grid que aprovecha mejor el ancho completo.
// fluid: false (default) = formulario de campos angostos, se ve mejor con un ancho legible acotado.
const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { id: 'perfil', label: 'Mi Perfil', icon: User, adminOnly: false },
    ],
  },
  {
    label: 'Operación',
    items: [
      { id: 'tramites', label: 'Operaciones', icon: FileText, adminOnly: true, fluid: true },
      { id: 'operarios', label: 'Operarios', icon: UserSquare, adminOnly: true, fluid: true },
      { id: 'etiquetas', label: 'Etiquetas', icon: Tags, adminOnly: true, fluid: true },
      { id: 'importar_clientes', label: 'Importar Clientes', icon: Upload, adminOnly: true, fluid: true },
      { id: 'ai_bots', label: 'Agentes IA', icon: Bot, adminOnly: true, fluid: true },
      { id: 'config_campos', label: 'Campos Base', icon: FileJson, adminOnly: true, fluid: true },
    ],
  },
  {
    label: 'Cuenta',
    items: [
      { id: 'marca', label: 'Marca', icon: Palette, adminOnly: true },
      { id: 'integraciones', label: 'Integraciones', icon: LinkIcon, adminOnly: true, fluid: true },
      { id: 'cabecera_clientes', label: 'Cabecera Clientes', icon: LayoutTemplate, adminOnly: true, fluid: true },
      { id: 'mantenimiento', label: 'Mantenimiento', icon: Wand2, adminOnly: true, fluid: true },
    ],
  },
];

const PANELS = {
  perfil: (props) => <PerfilSettings userProfile={props.userProfile} />,
  tramites: () => <TramitesSettings />,
  operarios: () => <OperariosSettings />,
  etiquetas: () => <EtiquetasSettings />,
  importar_clientes: () => <ImportClientesSettings />,
  ai_bots: () => <AiBotBuilder />,
  config_campos: () => <ConfigCamposClientesSettings />,
  marca: () => <MarcaSettings />,
  integraciones: () => <IntegrationsHub />,
  cabecera_clientes: () => <HeaderSettings />,
  mantenimiento: () => <MantenimientoSettings />,
};

export default function SettingsView({ userProfile }) {
  const isAdmin = userProfile?.rol === 'admin' || userProfile?.rol === 'admin_plus';
  const [activeTab, setActiveTab] = useState('perfil');

  const activeItem = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.id === activeTab);
  const isWideView = activeTab === 'ai_bots';
  const isFluid = !isWideView && activeItem?.fluid;

  return (
    <div className="stg-shell">
      <style>{`
        .stg-shell { display: flex; flex-direction: column; height: 100%; background: var(--color-bg-canvas); }

        .stg-header { padding: 1.75rem 2.5rem; background: var(--color-bg-surface); border-bottom: 1px solid var(--color-border); display: flex; align-items: center; gap: 0.9rem; }
        .stg-header-icon {
          width: 40px; height: 40px; border-radius: var(--radius-lg); flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: var(--brand-primary-light); border: 1px solid var(--brand-primary-glow);
        }
        .stg-header h1 { margin: 0; font-size: 1.375rem; font-weight: 700; letter-spacing: -0.02em; color: var(--color-text-primary); }
        .stg-header p { margin: 0.2rem 0 0; font-size: 0.85rem; color: var(--color-text-secondary); }

        .stg-body { display: flex; flex: 1; overflow: hidden; }

        .stg-nav { width: 232px; flex-shrink: 0; background: var(--color-bg-surface); border-right: 1px solid var(--color-border); padding: 1.25rem 0.75rem; overflow-y: auto; }
        .stg-nav-group + .stg-nav-group { margin-top: 1.25rem; }
        .stg-nav-label { padding: 0 0.75rem; margin-bottom: 0.4rem; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-muted); }
        .stg-nav-btn {
          width: 100%; display: flex; align-items: center; gap: 0.65rem; padding: 0.55rem 0.75rem;
          border-radius: var(--radius-lg); border: none; background: transparent; cursor: pointer;
          font-size: 0.85rem; font-weight: 500; color: var(--color-text-secondary);
          text-align: left; transition: background var(--transition-fast), color var(--transition-fast);
        }
        .stg-nav-btn:hover { background: var(--color-bg-elevated); color: var(--color-text-primary); }
        .stg-nav-btn.active { background: var(--brand-primary-light); color: var(--brand-primary); font-weight: 600; }
        .stg-nav-btn svg { flex-shrink: 0; }

        .stg-content { flex: 1; overflow-y: auto; }
        .stg-content-inner { padding: 2rem 3rem; max-width: 960px; }
        .stg-content-inner.fluid { max-width: 100%; }
        .stg-content-inner.wide { padding: 0; max-width: 100%; height: 100%; }
      `}</style>

      <div className="stg-header">
        <div className="stg-header-icon">
          <SettingsIcon size={20} color="var(--brand-primary)" />
        </div>
        <div>
          <h1>Configuración {isAdmin ? 'del Sistema' : 'de Usuario'}</h1>
          <p>
            {isAdmin
              ? 'Gestiona los catálogos y parámetros operacionales de la aplicación.'
              : 'Configura las opciones de tu perfil personal.'}
          </p>
        </div>
      </div>

      <div className="stg-body">
        <nav className="stg-nav">
          {NAV_SECTIONS.map((section, idx) => {
            const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin);
            if (visibleItems.length === 0) return null;
            return (
              <div className="stg-nav-group" key={section.label || `group-${idx}`}>
                {section.label && <div className="stg-nav-label">{section.label}</div>}
                {visibleItems.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    className={`stg-nav-btn${activeTab === id ? ' active' : ''}`}
                    onClick={() => setActiveTab(id)}
                  >
                    <Icon size={17} />
                    {label}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="stg-content">
          <div className={`stg-content-inner${isWideView ? ' wide' : ''}${isFluid ? ' fluid' : ''}`}>
            {activeItem && PANELS[activeItem.id]({ userProfile })}
          </div>
        </div>
      </div>
    </div>
  );
}
