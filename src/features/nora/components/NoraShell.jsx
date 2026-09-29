import React, { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, MessagesSquare, MessageSquareText, ShieldCheck, History, FileText, Brain, Lightbulb, Upload, Settings2,
} from 'lucide-react';
import { getResumen } from '../services/noraService';
import { NK } from '../useNora';
import { KnowledgeSearchBox } from './KnowledgeSearch';
import NoraDashboard from './NoraDashboard';
import ConversacionesPage from './ConversacionesPage';
import RespuestasPage from './RespuestasPage';
import ReglasPage from './ReglasPage';
import CasosPage from './CasosPage';
import DocumentosPage from './DocumentosPage';
import MemoriasPage from './MemoriasPage';
import AprendizajesPage from './AprendizajesPage';
import ImportarPage from './ImportarPage';
import NoraConfigPage from './NoraConfigPage';
import KnowledgeSearch from './KnowledgeSearch';

const MENU = [
  { items: [['inicio', 'Inicio', LayoutDashboard], ['conversaciones', 'Conversaciones', MessagesSquare]] },
  {
    title: 'Conocimiento',
    items: [
      ['respuestas', 'Respuestas', MessageSquareText, 'respuestasBorrador'],
      ['reglas', 'Reglas', ShieldCheck],
      ['casos', 'Casos históricos', History, 'casosPendientes'],
      ['documentos', 'Documentos', FileText, 'documentosPendientes'],
      ['memorias', 'Memorias', Brain],
      ['aprendizajes', 'Aprendizajes', Lightbulb, 'aprendizajesPendientes'],
    ],
  },
  { items: [['importar', 'Importar', Upload], ['configuracion', 'Configuración', Settings2]] },
];

// Centro de control de Nora: menú propio + búsqueda arriba. Separado del panel operacional.
export default function NoraShell({ section = 'inicio', query, onSection, comercialLeadId, onAbrirLead, onNavigate, onNavigateToClient }) {
  const resumen = useQuery({ queryKey: NK.resumen, queryFn: getResumen, refetchInterval: 60_000 });
  const [focus, setFocus] = useState(null);
  const open = useCallback((s, id = null) => {
    setFocus(id ? { section: s, id } : null);
    onSection(s);
  }, [onSection]);
  const focusDone = useCallback(() => setFocus(null), []);
  const focusId = focus?.section === section ? focus.id : null;
  const pageProps = { focusId, onFocusDone: focusDone, onOpen: open };

  return (
    <div className="flex min-h-0 flex-1">
      <nav className="hidden w-48 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-bg-surface px-2 py-3 md:flex" aria-label="Nora">
        {MENU.map((grupo, gi) => (
          <div key={gi}>
            {grupo.title && <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">{grupo.title}</p>}
            {grupo.items.map(([key, label, Icon, pend]) => {
              const n = pend ? resumen.data?.[pend] : 0;
              const activo = section === key;
              return (
                <button key={key} onClick={() => open(key)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ${activo ? 'bg-brand-primary-light font-medium text-brand-primary' : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'}`}>
                  <Icon size={14} className="shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                  {n > 0 && <span className="rounded bg-warning-bg px-1 text-[10px] font-semibold tabular-nums text-warning">{n}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-bg-surface px-4 py-2">
          <select className="h-8 rounded-md border border-border bg-bg-surface px-2 text-[13px] md:hidden" value={section} onChange={(e) => open(e.target.value)} aria-label="Sección de Nora">
            {MENU.flatMap((g) => g.items).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <KnowledgeSearchBox value={section === 'buscar' ? query : ''} onSearch={(q) => onSection('buscar', q)} />
        </div>
        {section === 'conversaciones' ? (
          <ConversacionesPage leadAbiertoKommoId={comercialLeadId} onAbrirLead={onAbrirLead} onOpen={open} onNavigate={onNavigate} />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto bg-bg-base">
            {section === 'inicio' && <NoraDashboard onOpen={open} />}
            {section === 'respuestas' && <RespuestasPage {...pageProps} />}
            {section === 'reglas' && <ReglasPage {...pageProps} />}
            {section === 'casos' && <CasosPage {...pageProps} />}
            {section === 'documentos' && <DocumentosPage {...pageProps} />}
            {section === 'memorias' && <MemoriasPage {...pageProps} onNavigateToClient={onNavigateToClient} />}
            {section === 'aprendizajes' && <AprendizajesPage {...pageProps} />}
            {section === 'importar' && <ImportarPage onOpen={open} />}
            {section === 'configuracion' && <NoraConfigPage onOpen={open} />}
            {section === 'buscar' && <KnowledgeSearch query={query} onOpen={open} />}
          </div>
        )}
      </div>
    </div>
  );
}
