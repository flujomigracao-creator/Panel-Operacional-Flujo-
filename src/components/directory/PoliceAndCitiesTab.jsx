import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Building2, MapPin, Plus, Search, Edit2, Trash2, Paperclip } from 'lucide-react';
import PoliciaModal from './PoliciaModal';
import ProcesoArchivoViewer from './ProcesoArchivoViewer';
import ProcesoDetailModal from './ProcesoDetailModal';

const PAGE_SIZE = 1000;

// Un posto puede cubrir decenas/cientos de ciudades (ej. una SR/PF de
// capital) — mostrarlas todas de entrada infla la tarjeta a pantallas
// completas. Sin búsqueda activa se listan solo las primeras
// CIUDADES_COLLAPSED_LIMIT, con un botón para expandir el resto.
const CIUDADES_COLLAPSED_LIMIT = 6;

// Supabase/PostgREST cap cada respuesta a PAGE_SIZE filas por defecto.
// ciudades (~6200 municipios) y policias_ciudades ya superan eso. En vez de
// pedir cada página una detrás de otra (lo que con ciudades eran 7 round
// trips en serie), se pide la primera página junto con el count exacto y el
// resto de las páginas se piden todas juntas en paralelo.
async function fetchAllRows(table, select = '*', orderBy = null) {
  const buildQuery = (withCount) => {
    let query = supabase.from(table).select(select, withCount ? { count: 'exact' } : undefined);
    if (orderBy) query = query.order(orderBy);
    return query;
  };

  const { data: firstPage, count, error: firstError } = await buildQuery(true).range(0, PAGE_SIZE - 1);
  if (firstError) throw firstError;

  let rows = firstPage || [];

  if (rows.length === PAGE_SIZE) {
    if (typeof count === 'number') {
      const ranges = [];
      for (let from = PAGE_SIZE; from < count; from += PAGE_SIZE) {
        ranges.push([from, Math.min(from + PAGE_SIZE - 1, count - 1)]);
      }
      const restPages = await Promise.all(ranges.map(([from, to]) => buildQuery(false).range(from, to)));
      for (const { data, error } of restPages) {
        if (error) throw error;
        rows = rows.concat(data || []);
      }
    } else {
      // No se pudo confiar en el count (raro) — se sigue paginando en serie
      // como antes, para no arriesgar perder filas silenciosamente.
      let from = PAGE_SIZE;
      for (;;) {
        const { data, error } = await buildQuery(false).range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        rows = rows.concat(data || []);
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }
  }

  return rows;
}

export default function PoliceAndCitiesTab() {
  const [policias, setPolicias] = useState([]);
  const [ciudades, setCiudades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  // Modals state
  const [isEditingPolicia, setIsEditingPolicia] = useState(false);
  const [currentPolicia, setCurrentPolicia] = useState(null);
  const [viewingArchivo, setViewingArchivo] = useState(null);
  const [viewingProceso, setViewingProceso] = useState(null);
  const [expandedCardCiudades, setExpandedCardCiudades] = useState(new Set());

  const toggleCardCiudades = (policiaId) => {
    setExpandedCardCiudades(prev => {
      const next = new Set(prev);
      if (next.has(policiaId)) next.delete(policiaId);
      else next.add(policiaId);
      return next;
    });
  };

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Las 6 tablas son independientes entre sí (el cruce entre policías,
      // ciudades, puntos y procesos se arma en JS más abajo), así que se
      // piden todas en paralelo en vez de en etapas una detrás de otra.
      // policia_puntos/policia_procesos/policia_proceso_archivos son tablas
      // opcionales/nuevas: si todavía no se corrió su migración, se
      // resuelven a [] en vez de tirar abajo el resto del directorio.
      const fetchOptional = async (table, select, orderBy) => {
        try {
          return await fetchAllRows(table, select, orderBy);
        } catch (err) {
          if (err.code === '42P01') return [];
          throw err;
        }
      };

      let policiasData, ciudadesData, relData, puntosData, procesosData, procesoArchivosData;
      try {
        [policiasData, ciudadesData, relData, puntosData, procesosData, procesoArchivosData] = await Promise.all([
          fetchAllRows('policias', '*', 'nombre'),
          fetchAllRows('ciudades', '*', 'nombre'),
          fetchAllRows('policias_ciudades', '*'),
          fetchOptional('policia_puntos', '*'),
          fetchOptional('policia_procesos', '*', 'orden'),
          fetchOptional('policia_proceso_archivos', '*'),
        ]);
      } catch (err) {
        if (err.code === '42P01') {
          throw new Error('Las tablas no existen aún. Por favor, ejecuta el script SQL en Supabase.');
        }
        throw err;
      }

      // Combinar relaciones, puntos adicionales y procesos (con sus
      // archivos) en los objetos de policía
      const policiasConCiudades = (policiasData || []).map(p => {
        const rels = (relData || []).filter(r => r.policia_id === p.id);
        const pCiudades = rels.map(r => ciudadesData.find(c => c.id === r.ciudad_id)).filter(Boolean);
        const pPuntos = puntosData.filter(punto => punto.policia_id === p.id);
        const pProcesos = procesosData
          .filter(proceso => proceso.policia_id === p.id)
          .map(proceso => ({
            ...proceso,
            archivos: procesoArchivosData.filter(a => a.proceso_id === proceso.id),
          }));
        return { ...p, ciudades: pCiudades, puntos: pPuntos, procesos: pProcesos };
      });

      setPolicias(policiasConCiudades);
      setCiudades(ciudadesData || []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message);
      // Fallback a mock data para demostrar UI si no hay tablas
      setPolicias([
        { id: 1, nombre: 'ALTAMIRA - DPF/ATM/PA', direccion: 'Rua Acesso 3, 850', email: ['nucart.atm.pa@pf.gov.br'], ciudades: [{ id: 1, nombre: 'Altamira', estado: 'Pará' }] },
        { id: 2, nombre: 'BELÉM - SR/PF/PA', direccion: 'Av. Almirante Barroso, 3251', email: ['delemig.drex.spa@pf.gov.br'], ciudades: [{ id: 2, nombre: 'Belém', estado: 'Pará' }] },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // PoliciaModal ya guardó todo y nos devuelve la fila completa (con sus
  // ciudades/puntos/procesos resueltos a partir de lo que la propia
  // inserción/actualización devolvió) — alcanza con actualizar esa policía
  // en memoria. Volver a pedir las 6 tablas del directorio entero (ciudades
  // incluye ~6200 filas) solo para reflejar el cambio de una sola policía
  // era el reload lento que se sentía al cerrar el modal de edición.
  function handlePoliciaSaved(updatedPolicia) {
    setPolicias(prev => {
      const exists = prev.some(p => p.id === updatedPolicia.id);
      const next = exists
        ? prev.map(p => (p.id === updatedPolicia.id ? updatedPolicia : p))
        : [...prev, updatedPolicia];
      return next.slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    });
  }

  const normalize = (s) =>
    (s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();

  const normalizedSearch = normalize(search);
  const filteredPolicias = policias.filter(
    (p) =>
      normalize(p.nombre).includes(normalizedSearch) ||
      (p.ciudades || []).some((c) => normalize(c.nombre).includes(normalizedSearch))
  );

  return (
    <div className="h-full flex flex-col p-8 overflow-auto">
      {/* Toolbar */}
      <div className="flex justify-between items-center mb-6">
        <div className="relative w-72">
          <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-chrome-text-muted" />
          <input
            type="text"
            placeholder="Buscar comisarías..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-chrome-bg border border-chrome-border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-brand-primary"
          />
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-chrome-bg border border-chrome-border rounded-lg text-sm hover:bg-chrome-bg-hover transition-colors">
            <MapPin size={16} />
            Gestionar Ciudades
          </button>
          <button 
            onClick={() => { setCurrentPolicia(null); setIsEditingPolicia(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg text-sm hover:bg-brand-primary/90 transition-colors"
          >
            <Plus size={16} />
            Añadir Policía
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-lg text-sm">
          <strong>Aviso:</strong> {error} <br/> 
          <em>(Mostrando datos de prueba temporales. Usa el botón "Añadir Policía" para probar la UI.)</em>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-chrome-text-muted">Cargando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPolicias.map(policia => (
            <div key={policia.id} className="bg-chrome-bg border border-chrome-border rounded-xl p-5 hover:border-brand-primary/50 transition-colors group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-chrome-bg-active flex items-center justify-center text-chrome-text">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-chrome-text">{policia.nombre}</h3>
                    <p className="text-xs text-chrome-text-muted">{policia.email?.length > 0 ? policia.email.join(', ') : 'Sin email'}</p>
                  </div>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setCurrentPolicia(policia); setIsEditingPolicia(true); }}
                    className="p-1.5 text-chrome-text-muted hover:text-brand-primary rounded-md hover:bg-chrome-bg-hover"
                    title="Editar"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button className="p-1.5 text-chrome-text-muted hover:text-red-500 rounded-md hover:bg-chrome-bg-hover" title="Eliminar">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="space-y-2 mb-4 text-sm text-chrome-text-muted">
                <div className="flex items-start gap-2">
                  <MapPin size={16} className="mt-0.5 flex-shrink-0" />
                  <span>{policia.direccion || 'Dirección no especificada'}</span>
                </div>
              </div>

              {policia.procesos && policia.procesos.length > 0 && (
                <div className="border-t border-chrome-border pt-4 mb-4 space-y-3">
                  <p className="text-xs font-medium text-chrome-text-muted uppercase tracking-wider mb-1">
                    Procedimientos
                  </p>
                  {policia.procesos.map(proceso => (
                    <button
                      key={proceso.id}
                      type="button"
                      onClick={() => setViewingProceso(proceso)}
                      className="w-full text-left rounded-md -mx-1.5 px-1.5 py-1 hover:bg-chrome-bg-hover transition-colors"
                      title="Ver proceso completo"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-chrome-text truncate">{proceso.titulo || 'Proceso'}</span>
                        {proceso.archivos && proceso.archivos.length > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-chrome-text-muted flex-shrink-0">
                            <Paperclip size={10} />
                            {proceso.archivos.length}
                          </span>
                        )}
                      </div>
                      {proceso.descripcion && (
                        <p className="text-xs text-chrome-text-muted truncate">{proceso.descripcion}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-chrome-border pt-4">
                <p className="text-xs font-medium text-chrome-text-muted mb-2 uppercase tracking-wider">Ciudades Cubiertas</p>
                <div className="flex flex-wrap gap-2">
                  {policia.ciudades && policia.ciudades.length > 0 ? (
                    (() => {
                      // Con búsqueda activa, se muestra solo la(s) ciudad(es)
                      // que coinciden (igual que la extensión Chrome) en vez
                      // de las ~decenas/cientos que puede cubrir un posto —
                      // si la búsqueda matcheó por nombre de policía y no por
                      // ninguna ciudad, se aplica el mismo límite colapsado
                      // de abajo (nada que aislar).
                      const matches = normalizedSearch.length > 0
                        ? policia.ciudades.filter(c => normalize(c.nombre).includes(normalizedSearch))
                        : [];
                      if (matches.length > 0) {
                        return matches.map(c => (
                          <span
                            key={c.id}
                            className="px-2 py-1 border text-xs rounded-md bg-brand-primary/10 border-brand-primary text-brand-primary font-medium"
                          >
                            {c.nombre}
                          </span>
                        ));
                      }

                      const isExpanded = expandedCardCiudades.has(policia.id);
                      const toShow = isExpanded ? policia.ciudades : policia.ciudades.slice(0, CIUDADES_COLLAPSED_LIMIT);
                      const hiddenCount = policia.ciudades.length - toShow.length;

                      return (
                        <>
                          {toShow.map(c => (
                            <span
                              key={c.id}
                              className="px-2 py-1 border text-xs rounded-md bg-chrome-bg-active border-chrome-border text-chrome-text"
                            >
                              {c.nombre}
                            </span>
                          ))}
                          {hiddenCount > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleCardCiudades(policia.id)}
                              className="px-2 py-1 border border-dashed border-chrome-border text-xs rounded-md text-chrome-text-muted hover:text-brand-primary hover:border-brand-primary/50 transition-colors"
                            >
                              +{hiddenCount} más
                            </button>
                          )}
                          {isExpanded && policia.ciudades.length > CIUDADES_COLLAPSED_LIMIT && (
                            <button
                              type="button"
                              onClick={() => toggleCardCiudades(policia.id)}
                              className="px-2 py-1 border border-dashed border-chrome-border text-xs rounded-md text-chrome-text-muted hover:text-brand-primary hover:border-brand-primary/50 transition-colors"
                            >
                              Ver menos
                            </button>
                          )}
                        </>
                      );
                    })()
                  ) : (
                    <span className="text-xs text-chrome-text-muted italic">Ninguna ciudad asignada</span>
                  )}
                </div>
              </div>

              {policia.puntos && policia.puntos.length > 0 && (
                <div className="border-t border-chrome-border pt-4 mt-4">
                  <p className="text-xs font-medium text-chrome-text-muted mb-2 uppercase tracking-wider">
                    Postos
                  </p>
                  <div className="flex flex-col gap-2">
                    {policia.puntos.map(punto => (
                      <div key={punto.id} className="text-xs text-chrome-text-muted">
                        {punto.sigla && <span className="font-medium text-chrome-text">{punto.sigla}: </span>}
                        {punto.direccion || 'Sin dirección'}
                        {punto.telefono?.length > 0 && <span> · {punto.telefono.join(', ')}</span>}
                        {punto.email?.length > 0 && <span> · {punto.email.join(', ')}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <PoliciaModal
        isOpen={isEditingPolicia}
        onClose={() => setIsEditingPolicia(false)}
        policia={currentPolicia}
        ciudades={ciudades}
        onSave={handlePoliciaSaved}
      />

      {viewingArchivo && (
        <ProcesoArchivoViewer archivo={viewingArchivo} onClose={() => setViewingArchivo(null)} />
      )}

      {viewingProceso && (
        <ProcesoDetailModal
          proceso={viewingProceso}
          onClose={() => setViewingProceso(null)}
          onViewArchivo={setViewingArchivo}
        />
      )}
    </div>
  );
}
