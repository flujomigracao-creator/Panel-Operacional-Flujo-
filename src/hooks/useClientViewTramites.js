/**
 * useClientViewTramites.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Encapsula toda la lógica de creación y gestión de trámites dentro de la
 * vista de cliente. Maneja estado del modal, creación, y cambio de estado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { 
  createEntrada, updateEntradaEstado, updateEntradaServicio, 
  updateEntradaOperario, updateEntradaDatosPersonalizados,
  getCatalogoTramites, getOperarios, deleteEntrada 
} from '../services/tramitesService';

export default function useClientViewTramites({ clientId, queryClient }) {
  const [isNewTramiteModalOpen, setIsNewTramiteModalOpen] = useState(false);
  const [newTramiteData, setNewTramiteData] = useState({ servicio: '', operario: '' });
  const [isCreatingTramite, setIsCreatingTramite] = useState(false);

  const catalogoQuery = useQuery({
    queryKey: ['tramites_catalogo'],
    queryFn: getCatalogoTramites,
    staleTime: 10 * 60 * 1000,
  });

  const operariosQuery = useQuery({
    queryKey: ['operarios'],
    queryFn: getOperarios,
    staleTime: 10 * 60 * 1000,
  });

  const handleChangeTramiteState = useCallback(async (entradaId, newState) => {
    try {
      await updateEntradaEstado(entradaId, newState);
      queryClient.invalidateQueries({ queryKey: ['entradas', clientId] });
      toast.success('Estado del trámite actualizado');
    } catch (err) {
      console.error('[useClientViewTramites] handleChangeTramiteState:', err.message || err, JSON.stringify(err));
      toast.error('Error al actualizar el estado del trámite: ' + (err.message || ''));
    }
  }, [clientId, queryClient]);

  const handleChangeTramiteServicio = useCallback(async (entradaId, newServicio) => {
    try {
      await updateEntradaServicio(entradaId, newServicio);
      queryClient.invalidateQueries({ queryKey: ['entradas', clientId] });
      toast.success('Servicio del trámite actualizado');
    } catch (err) {
      console.error('[useClientViewTramites] handleChangeTramiteServicio:', err);
      toast.error('Error al actualizar el servicio del trámite.');
    }
  }, [clientId, queryClient]);

  const handleChangeTramiteOperario = useCallback(async (entradaId, newOperario) => {
    try {
      await updateEntradaOperario(entradaId, newOperario);
      queryClient.invalidateQueries({ queryKey: ['entradas', clientId] });
      toast.success('Operario del trámite actualizado');
    } catch (err) {
      console.error('[useClientViewTramites] handleChangeTramiteOperario:', err);
      toast.error('Error al actualizar el operario del trámite.');
    }
  }, [clientId, queryClient]);

  const handleChangeTramiteDatos = useCallback(async (entradaId, datos) => {
    try {
      await updateEntradaDatosPersonalizados(entradaId, datos);
      queryClient.invalidateQueries({ queryKey: ['entradas', clientId] });
      toast.success('Datos del trámite guardados');
    } catch (err) {
      console.error('[useClientViewTramites] handleChangeTramiteDatos:', err);
      toast.error('Error al guardar datos del trámite');
    }
  }, [clientId, queryClient]);

  const handleDeleteTramite = useCallback(async (entradaId) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este trámite? Se eliminará todo su historial asociado.')) return;
    
    try {
      await deleteEntrada(entradaId);
      queryClient.invalidateQueries({ queryKey: ['entradas', clientId] });
      toast.success('Trámite eliminado exitosamente');
    } catch (err) {
      console.error('[useClientViewTramites] handleDeleteTramite:', err);
      toast.error('Error al eliminar el trámite.');
    }
  }, [clientId, queryClient]);

  const handleCreateTramite = useCallback(async () => {
    if (!newTramiteData.servicio.trim()) {
      toast.error('Por favor ingresa el nombre del servicio/trámite.');
      return;
    }
    setIsCreatingTramite(true);
    const toastId = toast.loading('Creando trámite...');
    try {
      await createEntrada({
        id_cliente: clientId,
        servicio: newTramiteData.servicio,
        operario: newTramiteData.operario,
      });
      queryClient.invalidateQueries({ queryKey: ['entradas', clientId] });
      setIsNewTramiteModalOpen(false);
      setNewTramiteData({ servicio: '', operario: '' });
      toast.success('Trámite creado', { id: toastId });
    } catch (err) {
      console.error('[useClientViewTramites] handleCreateTramite:', err);
      toast.error('Error al crear el trámite.', { id: toastId });
    } finally {
      setIsCreatingTramite(false);
    }
  }, [clientId, newTramiteData, queryClient]);

  return {
    // State
    isNewTramiteModalOpen,
    setIsNewTramiteModalOpen,
    newTramiteData,
    setNewTramiteData,
    isCreatingTramite,
    catalogoTramites: catalogoQuery.data || [],
    isLoadingCatalogo: catalogoQuery.isLoading,
    operariosList: operariosQuery.data || [],
    isLoadingOperarios: operariosQuery.isLoading,
    // Handlers
    handleChangeTramiteState,
    handleChangeTramiteServicio,
    handleChangeTramiteOperario,
    handleChangeTramiteDatos,
    handleCreateTramite,
    handleDeleteTramite,
  };
}
