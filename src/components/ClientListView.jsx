import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { User, Search, Filter, ArrowDownUp, Calendar, X, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '../utils/dateFormatter';
import { useOrganization } from '../context/OrganizationContext';
import { SkeletonCard } from './ui/SkeletonCard';
import { useQuery } from '@tanstack/react-query';

export default function ClientListView({ onNavigateToClient, searchQuery }) {
  const { loading: orgLoading } = useOrganization();
  const [sortField, setSortField] = useState('creado_en');
  const [sortOrder, setSortOrder] = useState('desc');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [activeTab, setActiveTab] = useState('todos');
  const [dateFilterType, setDateFilterType] = useState('creado_en');
  const [filterNacionalidad, setFilterNacionalidad] = useState('all');
  const [filterMissingDoc, setFilterMissingDoc] = useState('all');
  const [filterDireccion, setFilterDireccion] = useState('');
  const [filterCiudadOrigen, setFilterCiudadOrigen] = useState('');
  const [filterEstadoCivil, setFilterEstadoCivil] = useState('all');
  const [filterSexo, setFilterSexo] = useState('all');

  // Supabase corta cada request en 1000 filas — para traer TODOS los
  // clientes (no solo los primeros N) hay que paginar en loop internamente
  // en vez de mostrar un botón "cargar más".
  const FETCH_PAGE_SIZE = 1000;

  // Identificadores que SIGUEN siendo columnas reales de `clientes` — se pueden
  // ordenar directo con `.order(sortField, ...)`. Cualquier otro sortField se
  // asume que vive en `clientes.campos_personalizados` (JSONB, incluye los 13
  // campos migratorios) y se ordena con el operador `->>` de Postgres.
  const FIXED_SORT_COLUMNS = new Set([
    'nombre', 'cpf', 'telefono', 'email', 'estado_civil', 'sexo', 'nacionalidad',
    'pais', 'lugar_nacimiento', 'estado_federal', 'ciudad', 'direccion',
    'id_kommo', 'fecha_nacimiento', 'estado_cliente', 'creado_en', 'modificado_en',
  ]);

  const {
    data: allFetchedClientes = [],
    isLoading: loading,
  } = useQuery({
    queryKey: ['clientesList', sortField, sortOrder, activeTab, filterNacionalidad, filterMissingDoc, filterEstadoCivil, filterSexo],
    queryFn: async () => {
      // Los campos JSONB guardan fechas como texto ISO 'YYYY-MM-DD', así que el
      // orden alfabético de texto coincide con el orden cronológico real — no
      // hace falta castear a ::date. nullsFirst: false siempre, para que los
      // clientes sin ese campo cargado queden al final (asc y desc por igual).
      const orderExpr = FIXED_SORT_COLUMNS.has(sortField) ? sortField : `campos_personalizados->>${sortField}`;

      const buildQuery = (withCount) => {
        // `id` como desempate: cientos de clientes comparten el mismo creado_en
        // exacto (migración masiva) y sin un desempate único Postgres no
        // garantiza el mismo orden entre una página y la siguiente — algunos
        // quedaban afuera del total traído.
        let query = supabase
          .from('clientes')
          .select('*', withCount ? { count: 'exact' } : undefined)
          .order(orderExpr, { ascending: sortOrder === 'asc', nullsFirst: false })
          .order('id', { ascending: sortOrder === 'asc' });

        if (activeTab !== 'todos') {
          query = query.eq('estado_cliente', activeTab);
        }
        if (filterNacionalidad !== 'all') {
          query = query.ilike('nacionalidad', `%${filterNacionalidad}%`);
        }
        if (filterEstadoCivil !== 'all') {
          query = query.ilike('estado_civil', `%${filterEstadoCivil}%`);
        }
        if (filterSexo !== 'all') {
          query = query.ilike('sexo', `%${filterSexo}%`);
        }
        return query;
      };

      const { data: firstPage, count, error: firstError } = await buildQuery(true).range(0, FETCH_PAGE_SIZE - 1);
      if (firstError) throw firstError;

      let all = firstPage || [];

      if (all.length === FETCH_PAGE_SIZE) {
        if (typeof count === 'number') {
          // Con el total ya conocido, se piden todas las páginas restantes en
          // paralelo en vez de una detrás de otra — con miles de clientes esto
          // baja varios round trips en serie a básicamente uno solo de tiempo
          // de espera real.
          const ranges = [];
          for (let from = FETCH_PAGE_SIZE; from < count; from += FETCH_PAGE_SIZE) {
            ranges.push([from, Math.min(from + FETCH_PAGE_SIZE - 1, count - 1)]);
          }
          const restPages = await Promise.all(ranges.map(([from, to]) => buildQuery(false).range(from, to)));
          for (const { data, error } of restPages) {
            if (error) throw error;
            all = all.concat(data || []);
          }
        } else {
          // No se pudo confiar en el count (raro) — se sigue paginando en serie
          // como antes, para no arriesgar perder filas silenciosamente.
          let from = FETCH_PAGE_SIZE;
          for (;;) {
            const { data, error } = await buildQuery(false).range(from, from + FETCH_PAGE_SIZE - 1);
            if (error) throw error;
            all = all.concat(data || []);
            if (!data || data.length < FETCH_PAGE_SIZE) break;
            from += FETCH_PAGE_SIZE;
          }
        }
      }

      // Los campos personalizados dinámicos (config_campos_clientes) viven en
      // clientes.campos_personalizados — se aplanan acá para que búsqueda,
      // filtros y ordenamiento los traten igual que cualquier otra columna.
      return all.map(c => (c.campos_personalizados ? { ...c, ...c.campos_personalizados } : c));
    },
    enabled: !orgLoading,
  });

  const totalCount = allFetchedClientes.length;

  // Obtenemos nacionalidades únicas (podría mejorarse con una query específica)
  const distinctNationalities = React.useMemo(() => {
    const set = new Set();
    allFetchedClientes.forEach(c => {
      if (c.nacionalidad) set.add(c.nacionalidad.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [allFetchedClientes]);

  const filteredClientes = useMemo(() => {
    const res = allFetchedClientes.filter(c => {
      if (searchQuery) {
        const q = String(searchQuery).toLowerCase().trim();
        const qNormalized = q.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents

        const allText = Object.values(c)
          .filter(v => v && typeof v === 'string')
          .join(' ')
          .toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const allTextStripped = allText.replace(/[.\-()\s]/g, '');

        // Split search query into individual words/terms
        const searchTerms = qNormalized.split(/\s+/);

        // EVERY term must be found in the client's data (AND logic)
        const matchesAll = searchTerms.every(term => {
          const termStripped = term.replace(/[.\-()\s]/g, '');
          return allText.includes(term) || (termStripped.length > 0 && allTextStripped.includes(termStripped));
        });

        if (!matchesAll) {
          return false;
        }
      }

      if (dateFrom || dateTo) {
        const fieldVal = c[dateFilterType];
        if (!fieldVal) return false;
        const d = new Date(fieldVal);
        
        if (dateFrom) {
          const startD = new Date(dateFrom);
          // Ajustar a medianoche local
          startD.setHours(0,0,0,0);
          // Compensar el offset para evitar desfasajes
          startD.setMinutes(startD.getMinutes() + startD.getTimezoneOffset());
          if (d < startD) return false;
        }
        if (dateTo) {
           const endD = new Date(dateTo);
           endD.setHours(23,59,59,999);
           endD.setMinutes(endD.getMinutes() + endD.getTimezoneOffset());
           if (d > endD) return false;
        }
      }

      if (filterMissingDoc !== 'all') {
        if (filterMissingDoc === 'no_cpf' && c.cpf) return false;
        // rnm, numero_pasaporte, etc. no son columnas reales de `clientes` —
        // viven en campos_personalizados (JSONB), ver clientView.constants.js.
        if (filterMissingDoc === 'no_pasaporte' && c.campos_personalizados?.numero_pasaporte) return false;
        if (filterMissingDoc === 'no_rnm' && (c.campos_personalizados?.rnm || c.campos_personalizados?.rne)) return false;
      }

      if (filterDireccion.trim() !== '') {
        const q = filterDireccion.toLowerCase();
        const addr = [c.direccion, c.direccion_estado, c.direccion_ciudad, c.direccion_cep].filter(Boolean).join(' ').toLowerCase();
        if (!addr.includes(q)) return false;
      }

      if (filterCiudadOrigen.trim() !== '') {
        const q = filterCiudadOrigen.toLowerCase();
        const origin = [c.ciudad_origen, c.estado_origen, c.lugar_nacimiento, c.origen].filter(Boolean).join(' ').toLowerCase();
        if (!origin.includes(q)) return false;
      }

      return true;
    });
    return res;
  }, [allFetchedClientes, searchQuery, dateFrom, dateTo, dateFilterType, filterMissingDoc, filterDireccion, filterCiudadOrigen]);

  // El ordenamiento ya se hace en la consulta SQL (.order() arriba, tanto para
  // columnas reales como para campos_personalizados->>campo), así que un
  // re-sort en JS acá sería trabajo redundante: los datos ya llegan ordenados
  // y el .filter() de filteredClientes no altera el orden relativo.

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field.includes('fecha_vencimiento') ? 'asc' : 'desc');
    }
  };



  if (loading) {
    return (
      <div style={{ padding: '1.5rem 2rem' }} className="animate-fade-in">
        <div style={{ marginBottom: '2rem' }}>
          <SkeletonCard height={28} width={220} />
          <div style={{ marginTop: '0.5rem' }}>
            <SkeletonCard height={14} width={320} />
          </div>
        </div>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {[1, 2, 3, 4, 5, 6].map((row) => (
            <div
              key={row}
              style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', borderBottom: row < 6 ? '1px solid var(--color-border)' : 'none' }}
            >
              <SkeletonCard height={32} width={32} radius="50%" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SkeletonCard height={12} width="35%" />
                <SkeletonCard height={10} width="20%" />
              </div>
              <SkeletonCard height={12} width={90} />
              <SkeletonCard height={12} width={70} />
              <SkeletonCard height={18} width={60} radius={4} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2.5rem', maxWidth: '1200px', margin: '0 auto' }} className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Directorio de Clientes ({filteredClientes.length} visibles | Total: {totalCount})</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>Gestiona y busca en tu base de datos de clientes.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', position: 'relative' }}>
        {['todos', 'nuevo', 'en tramite', 'finalizado'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.5rem 1rem',
              background: activeTab === tab ? 'var(--color-bg-elevated)' : 'transparent',
              border: '1px solid',
              borderColor: activeTab === tab ? 'var(--color-border)' : 'transparent',
              borderRadius: 'var(--radius-md)',
              color: activeTab === tab ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontWeight: 500,
              textTransform: 'capitalize',
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontSize: '0.875rem'
            }}
          >
            {tab}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <button 
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`btn ${showAdvancedFilters || dateFrom || dateTo || filterNacionalidad !== 'all' || filterMissingDoc !== 'all' || filterDireccion || filterCiudadOrigen ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: 'var(--radius-md)', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
          >
            <Filter size={16} />
            Filtros
          </button>
        </div>

        {showAdvancedFilters && (
          <div className="animate-fade-in" style={{ 
            position: 'absolute', 
            top: 'calc(100% + 0.5rem)', 
            right: 0, 
            width: '350px', 
            padding: '1.5rem', 
            zIndex: 50,
            background: 'var(--color-bg-elevated)',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)'
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Filtros Avanzados
              <button onClick={() => setShowAdvancedFilters(false)} className="btn btn-ghost" style={{ padding: '0.2rem' }}>
                <X size={16} />
              </button>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Rango de Fechas */}
              <div style={{ gridColumn: '1 / -1', background: 'var(--color-bg-primary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>Filtrar por Fechas</label>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Aplicar fechas a:</label>
                    <select className="form-input" value={dateFilterType} onChange={e => setDateFilterType(e.target.value)} style={{ width: '100%', fontSize: '0.875rem' }}>
                      <option value="creado_en">Fecha de Registro</option>
                      <option value="fecha_nacimiento">Fecha de Nacimiento</option>
                      <option value="fecha_vencimiento_refugio">Vencimiento de Refugio</option>
                      <option value="fecha_vencimiento_pasaporte">Vencimiento de Pasaporte</option>
                    </select>
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Desde:</label>
                    <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: '100%', fontSize: '0.875rem' }} />
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Hasta:</label>
                    <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: '100%', fontSize: '0.875rem' }} />
                  </div>
                </div>
              </div>

              {/* Nacionalidad */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Nacionalidad</label>
                <select className="form-input" value={filterNacionalidad} onChange={e => setFilterNacionalidad(e.target.value)} style={{ width: '100%', fontSize: '0.875rem' }}>
                  <option value="all">Cualquier Nacionalidad</option>
                  {distinctNationalities.map(nac => (
                    <option key={nac} value={nac.toLowerCase()}>{nac}</option>
                  ))}
                </select>
              </div>

              {/* Estado Civil */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Estado Civil</label>
                <select className="form-input" value={filterEstadoCivil} onChange={e => setFilterEstadoCivil(e.target.value)} style={{ width: '100%', fontSize: '0.875rem' }}>
                  <option value="all">Cualquier Estado Civil</option>
                  <option value="soltero">Soltero(a)</option>
                  <option value="casado">Casado(a)</option>
                  <option value="divorciado">Divorciado(a)</option>
                  <option value="viudo">Viudo(a)</option>
                  <option value="union">Unión Estable</option>
                </select>
              </div>

              {/* Sexo */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Sexo</label>
                <select className="form-input" value={filterSexo} onChange={e => setFilterSexo(e.target.value)} style={{ width: '100%', fontSize: '0.875rem' }}>
                  <option value="all">Ambos</option>
                  <option value="masculino">Masculino</option>
                  <option value="femenino">Femenino</option>
                </select>
              </div>

              {/* Faltan Documentos */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Faltan Documentos</label>
                <select className="form-input" value={filterMissingDoc} onChange={e => setFilterMissingDoc(e.target.value)} style={{ width: '100%', fontSize: '0.875rem' }}>
                  <option value="all">Mostrar Todos</option>
                  <option value="no_cpf">Falta CPF</option>
                  <option value="no_pasaporte">Falta Pasaporte</option>
                  <option value="no_rnm">Falta RNM / RNE</option>
                </select>
              </div>

              {/* Dirección / Estado / Ciudad */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Dirección (Ciudad/Estado)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ej. Santa Catarina" 
                  value={filterDireccion} 
                  onChange={e => setFilterDireccion(e.target.value)} 
                  style={{ width: '100%', fontSize: '0.875rem' }} 
                />
              </div>

              {/* Ciudad de Origen */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Ciudad de Origen</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ej. La Habana" 
                  value={filterCiudadOrigen} 
                  onChange={e => setFilterCiudadOrigen(e.target.value)} 
                  style={{ width: '100%', fontSize: '0.875rem' }} 
                />
              </div>

            </div>
            
            {(filterNacionalidad !== 'all' || filterMissingDoc !== 'all' || filterDireccion || filterCiudadOrigen || filterEstadoCivil !== 'all' || filterSexo !== 'all' || dateFrom || dateTo) && (
              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                <button 
                  className="btn btn-ghost" 
                  onClick={() => { 
                    setFilterNacionalidad('all'); 
                    setFilterMissingDoc('all'); 
                    setFilterDireccion('');
                    setFilterCiudadOrigen('');
                    setFilterEstadoCivil('all');
                    setFilterSexo('all');
                    setDateFrom('');
                    setDateTo('');
                  }}  
                  style={{ color: 'var(--color-danger)', fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                >
                  Limpiar Filtros
                </button>
              </div>
            )}
          </div>
        )}
      </div>


      <div style={{ padding: '0', background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-secondary)', userSelect: 'none', background: 'var(--color-bg-elevated)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              <th onClick={() => handleSort('nombre')} style={{ padding: '1rem', fontWeight: 500, cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  Nombre {sortField === 'nombre' && (sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </div>
              </th>
              <th onClick={() => handleSort('cpf')} style={{ padding: '1rem', fontWeight: 500, cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  Documento {sortField === 'cpf' && (sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </div>
              </th>
              <th onClick={() => handleSort('fecha_vencimiento_pasaporte')} style={{ padding: '1rem', fontWeight: 500, cursor: 'pointer', color: sortField.includes('vencimiento') ? 'var(--color-primary)' : 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Calendar size={14} /> Vencimiento {sortField === 'fecha_vencimiento_pasaporte' && (sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </div>
              </th>
              <th onClick={() => handleSort('estado_cliente')} style={{ padding: '1rem', fontWeight: 500, cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  Estado {sortField === 'estado_cliente' && (sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredClientes.map(cliente => (
              <tr 
                key={cliente.id} 
                onClick={() => onNavigateToClient(cliente.id, cliente.nombre)}
                style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background 0.15s', background: 'var(--color-bg-base)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-bg-base)'}
              >
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                      {cliente.nombre ? cliente.nombre.substring(0, 2).toUpperCase() : 'CL'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{cliente.nombre || 'Sin nombre'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{cliente.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '1rem', color: 'var(--color-text-secondary)' }}>
                  <div>{cliente.cpf || cliente.campos_personalizados?.numero_pasaporte || cliente.campos_personalizados?.rnm || '—'}</div>
                </td>
                <td style={{ padding: '1rem', color: 'var(--color-primary)', fontWeight: 500 }}>
                  {cliente.campos_personalizados?.fecha_vencimiento_pasaporte ? formatDate(cliente.campos_personalizados.fecha_vencimiento_pasaporte) : (cliente.campos_personalizados?.fecha_vencimiento_refugio ? formatDate(cliente.campos_personalizados.fecha_vencimiento_refugio) : <span style={{color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 400}}>Sin fecha</span>)}
                </td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ 
                    padding: '0.125rem 0.375rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid transparent',
                    background: cliente.estado_cliente === 'nuevo' ? 'var(--status-procesando-bg)' : 'var(--status-completada-bg)',
                    color: cliente.estado_cliente === 'nuevo' ? 'var(--status-procesando)' : 'var(--status-completada)',
                    borderColor: cliente.estado_cliente === 'nuevo' ? 'var(--status-procesando-border)' : 'var(--status-completada-border)'
                  }}>
                    {cliente.estado_cliente || 'nuevo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredClientes.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            No se encontraron clientes.
          </div>
        )}
      </div>
    </div>
  );
}
