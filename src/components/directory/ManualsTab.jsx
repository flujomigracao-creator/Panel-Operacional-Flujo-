import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Book, Plus, Search, FileText, Download, Edit2, Trash2 } from 'lucide-react';
import ManualModal from './ManualModal';
import ViewManualModal from './ViewManualModal';

export default function ManualsTab() {
  const [manuales, setManuales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  // Modal state
  const [isEditingManual, setIsEditingManual] = useState(false);
  const [isViewingManual, setIsViewingManual] = useState(false);
  const [currentManual, setCurrentManual] = useState(null);

  useEffect(() => {
    fetchManuales();
  }, []);

  async function fetchManuales() {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('manuales_tramites')
        .select('*')
        .order('titulo');

      if (fetchError && fetchError.code === '42P01') {
        throw new Error('La tabla de manuales no existe aún. Ejecuta el script SQL.');
      }
      if (fetchError) throw fetchError;

      // manual_variantes es una tabla opcional/nueva: si todavía no se corrió
      // la migración, seguir mostrando el resto de los manuales igual.
      let variantesData = [];
      try {
        const { data: vData, error: vError } = await supabase.from('manual_variantes').select('*');
        if (vError && vError.code !== '42P01') throw vError;
        variantesData = vData || [];
      } catch (vErr) {
        if (vErr.code !== '42P01') throw vErr;
      }

      const manualesConVariantes = (data || []).map(m => ({
        ...m,
        variantes: variantesData.filter(v => v.manual_id === m.id),
      }));

      setManuales(manualesConVariantes);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message);
      // Fallback a mock data
      setManuales([
        { id: 1, titulo: 'Manual de Refugio', descripcion: 'Guía paso a paso para la solicitud de refugio en Brasil.', url_pdf: '#' },
        { id: 2, titulo: 'Guía de Residencia', descripcion: 'Trámite de residencia temporal y permanente, documentos necesarios y plazos.', url_pdf: '#' },
        { id: 3, titulo: 'Registro CPF', descripcion: 'Cómo obtener el CPF para extranjeros.', url_pdf: null }
      ]);
    } finally {
      setLoading(false);
    }
  }

  const filteredManuales = manuales.filter(m => m.titulo.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full flex flex-col p-8 overflow-auto">
      {/* Toolbar */}
      <div className="flex justify-between items-center mb-6">
        <div className="relative w-72">
          <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-chrome-text-muted" />
          <input
            type="text"
            placeholder="Buscar manuales..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-chrome-bg border border-chrome-border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-brand-primary"
          />
        </div>
        <button 
          onClick={() => { setCurrentManual(null); setIsEditingManual(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg text-sm hover:bg-brand-primary/90 transition-colors"
        >
          <Plus size={16} />
          Añadir Manual
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-lg text-sm">
          <strong>Aviso:</strong> {error} <br/> 
          <em>(Mostrando datos de prueba temporales.)</em>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-chrome-text-muted">Cargando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredManuales.map(manual => (
            <div key={manual.id} className="bg-chrome-bg border border-chrome-border rounded-xl p-5 hover:border-brand-primary/50 transition-colors group flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                    <FileText size={20} />
                  </div>
                  <h3 className="font-semibold text-chrome-text line-clamp-2">{manual.titulo}</h3>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => { setCurrentManual(manual); setIsEditingManual(true); }}
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
              
              <p className="text-sm text-chrome-text-muted mb-6 flex-1">
                {manual.descripcion || 'Sin descripción'}
              </p>

              <div className="border-t border-chrome-border pt-4 flex justify-between items-center">
                <button 
                  onClick={() => { setCurrentManual(manual); setIsViewingManual(true); }}
                  className="text-sm text-brand-primary hover:text-brand-primary/80 font-medium"
                >
                  Leer Documento
                </button>
                {manual.url_pdf && (
                  <button className="p-2 text-chrome-text-muted hover:text-brand-primary rounded-full hover:bg-chrome-bg-hover transition-colors" title="Descargar PDF">
                    <Download size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <ManualModal
        isOpen={isEditingManual}
        onClose={() => setIsEditingManual(false)}
        manual={currentManual}
        onSave={fetchManuales}
      />

      <ViewManualModal
        isOpen={isViewingManual}
        onClose={() => setIsViewingManual(false)}
        manual={currentManual}
      />
    </div>
  );
}
