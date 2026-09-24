import React, { useState } from 'react';
import { Building2, Book } from 'lucide-react';
import PoliceAndCitiesTab from './PoliceAndCitiesTab';
import ManualsTab from './ManualsTab';

export default function DirectoryView() {
  const [activeTab, setActiveTab] = useState('policias');

  return (
    <div className="flex flex-1 w-full min-h-0 flex-col bg-chrome-bg text-chrome-text">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-chrome-border px-8 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Directorio Operativo</h1>
          <p className="mt-1 text-sm text-chrome-text-muted">
            Gestiona comisarías, ciudades de cobertura y manuales de procedimientos.
          </p>
        </div>
      </header>

      {/* Tabs Nav */}
      <div className="flex-shrink-0 px-8 pt-4 border-b border-chrome-border bg-chrome-bg/50">
        <div className="flex gap-6">
          <TabButton
            icon={<Building2 size={18} />}
            label="Policías y Ciudades"
            isActive={activeTab === 'policias'}
            onClick={() => setActiveTab('policias')}
          />
          <TabButton
            icon={<Book size={18} />}
            label="Manuales de Trámites"
            isActive={activeTab === 'manuales'}
            onClick={() => setActiveTab('manuales')}
          />
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden relative bg-chrome-bg-subtle">
        {activeTab === 'policias' && <PoliceAndCitiesTab />}
        {activeTab === 'manuales' && <ManualsTab />}
      </div>
    </div>
  );
}

function TabButton({ icon, label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 pb-3 font-medium transition-colors ${
        isActive
          ? 'border-brand-primary text-brand-primary'
          : 'border-transparent text-chrome-text-muted hover:text-chrome-text hover:border-chrome-border'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
