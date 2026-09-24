/**
 * useClientViewRelations.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Encapsula la lógica de relaciones/vínculos familiares de la vista de cliente.
 * Maneja búsqueda debounced, creación/edición/eliminación de relaciones, y
 * control de modales de vinculación.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  insertRelacion,
  updateRelacionTipo,
  deleteRelacion,
  searchClientes,
} from '../services/clientesService';
import { supabase } from '../supabaseClient';

export default function useClientViewRelations({ clientId, queryClient }) {
  // Relate modal state
  const [isRelateModalOpen, setIsRelateModalOpen] = useState(false);
  const [selectedRelateId, setSelectedRelateId] = useState('');
  const [selectedRelateType, setSelectedRelateType] = useState('familiar');
  const [isNewRelateClientModalOpen, setIsNewRelateClientModalOpen] = useState(false);
  const [editingRelId, setEditingRelId] = useState(null);

  // Sync data state
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncTargetClient, setSyncTargetClient] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Search state for relating existing clients
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Debounced search for client linking
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const timer = setTimeout(async () => {
        try {
          const data = await searchClientes(searchQuery);
          setSearchResults(data);
        } catch (err) {
          console.error('[useClientViewRelations] search error:', err);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const handleRelateClient = useCallback(async () => {
    if (!selectedRelateId || !selectedRelateType) return;
    const toastId = toast.loading('Vinculando cliente...');
    try {
      await insertRelacion({
        cliente_id: clientId,
        cliente_relacionado_id: Number(selectedRelateId),
        tipo_relacion: selectedRelateType,
      });
      queryClient.invalidateQueries({ queryKey: ['relations', clientId] });
      setIsRelateModalOpen(false);
      setSelectedRelateId('');
      setSelectedRelateType('familiar');
      toast.success('Cliente vinculado correctamente', { id: toastId });
    } catch (err) {
      console.error('[useClientViewRelations] handleRelateClient:', err);
      toast.error('Error al vincular cliente', { id: toastId });
    }
  }, [clientId, selectedRelateId, selectedRelateType, queryClient]);

  const handleUpdateRelationType = useCallback(async (relId, newType) => {
    try {
      await updateRelacionTipo(relId, newType);
      queryClient.invalidateQueries({ queryKey: ['relations', clientId] });
      setEditingRelId(null);
    } catch (err) {
      console.error('[useClientViewRelations] handleUpdateRelationType:', err);
      toast.error('Error al actualizar la relación');
    }
  }, [clientId, queryClient]);

  const handleDeleteRelation = useCallback(async (relationId) => {
    if (!window.confirm('Eliminar este vínculo familiar?')) return;
    const toastId = toast.loading('Eliminando vínculo...');
    try {
      await deleteRelacion(relationId);
      queryClient.invalidateQueries({ queryKey: ['relations', clientId] });
      toast.success('Vínculo eliminado', { id: toastId });
    } catch (err) {
      console.error('[useClientViewRelations] handleDeleteRelation:', err);
      toast.error('Error eliminando la relación', { id: toastId });
    }
  }, [clientId, queryClient]);

  const handleOpenSyncModal = useCallback((targetClient) => {
    setSyncTargetClient(targetClient);
    setIsSyncModalOpen(true);
  }, []);

  const handleSyncData = useCallback(async (targetId, payload) => {
    setIsSyncing(true);
    const toastId = toast.loading('Sincronizando datos...');
    try {
      const { error } = await supabase.from('clientes').update(payload).eq('id', targetId);
      if (error) throw error;
      toast.success('Datos sincronizados correctamente', { id: toastId });
      // Invalidate target client data if it's cached, or allClientesBase
      queryClient.invalidateQueries({ queryKey: ['allClientesBase'] });
      // Query specific to client data might also need invalidation if they navigate to it
      queryClient.invalidateQueries({ queryKey: ['client', targetId] });
      setIsSyncModalOpen(false);
      setSyncTargetClient(null);
    } catch (err) {
      console.error('[useClientViewRelations] handleSyncData:', err);
      toast.error('Error al sincronizar datos', { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  }, [queryClient]);

  return {
    // State
    isRelateModalOpen,
    setIsRelateModalOpen,
    selectedRelateId,
    setSelectedRelateId,
    selectedRelateType,
    setSelectedRelateType,
    isNewRelateClientModalOpen,
    setIsNewRelateClientModalOpen,
    editingRelId,
    setEditingRelId,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSyncModalOpen,
    setIsSyncModalOpen,
    syncTargetClient,
    setSyncTargetClient,
    isSyncing,
    // Handlers
    handleRelateClient,
    handleUpdateRelationType,
    handleDeleteRelation,
    handleOpenSyncModal,
    handleSyncData,
  };
}
