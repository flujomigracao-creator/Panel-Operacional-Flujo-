/**
 * useClientData.js
 * Hook central de datos — Agente 2 + 3 (Arquitecto + Performance)
 * - Consume exclusivamente la capa de services (sin llamadas directas a supabase)
 * - Aprovecha react-query para caché, revalidación y estado de carga unificado
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCliente,
  getRelaciones,
  updateCliente,
} from '../services/clientesService';
import { getEntradas } from '../services/tramitesService';
import { getDocuments } from '../services/storageService';
import { getFormulariosByClient } from '../services/formulariosService';
import { findDuplicateContacts } from '../utils/contactUtils';

const STALE_DYNAMIC = 2  * 60 * 1000; // 2 min  — datos que cambian frecuente (documentos, entradas)
const STALE_CLIENT  = 5  * 60 * 1000; // 5 min  — datos del cliente

const useClientData = (clientId) => {
  const queryClient = useQueryClient();

  // ── Datos del cliente ──────────────────────────────────────────────────────
  const clientQuery = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => getCliente(clientId),
    enabled: !!clientId,
    staleTime: STALE_CLIENT,
    gcTime: STALE_CLIENT * 2,
  });

  // ── Relaciones ─────────────────────────────────────────────────────────────
  const relationsQuery = useQuery({
    queryKey: ['relations', clientId],
    queryFn: () => getRelaciones(clientId),
    enabled: !!clientId,
    staleTime: STALE_DYNAMIC,
    gcTime: STALE_DYNAMIC * 2,
  });

  // ── Documentos ─────────────────────────────────────────────────────────────
  const documentsQuery = useQuery({
    queryKey: ['documents', clientId],
    queryFn: () => getDocuments(clientId),
    enabled: !!clientId,
    staleTime: STALE_DYNAMIC,
    gcTime: STALE_DYNAMIC * 2,
  });

  // ── Trámites / Entradas ────────────────────────────────────────────────────
  const entradasQuery = useQuery({
    queryKey: ['entradas', clientId],
    queryFn: () => getEntradas(clientId),
    enabled: !!clientId,
    staleTime: STALE_DYNAMIC,
    gcTime: STALE_DYNAMIC * 2,
  });

  // ── Formularios ────────────────────────────────────────────────────────────
  const formulariosQuery = useQuery({
    queryKey: ['formularios', clientId],
    queryFn: () => getFormulariosByClient(clientId),
    enabled: !!clientId,
    staleTime: STALE_DYNAMIC,
    gcTime: STALE_DYNAMIC * 2,
  });

  // ── Contactos duplicados (depende de que el cliente esté cargado) ──────────
  const duplicateContactsQuery = useQuery({
    queryKey: ['duplicateContacts', clientQuery.data?.telefono, clientId],
    queryFn: () => findDuplicateContacts(clientQuery.data.telefono, clientId),
    enabled: !!clientQuery.data?.telefono,
    staleTime: STALE_CLIENT,
    gcTime: STALE_CLIENT * 2,
  });

  // ── Catálogo de campos personalizados dinámicos (config_campos_clientes) ───
  const customFieldsConfigQuery = useQuery({
    queryKey: ['customFieldsConfig'],
    queryFn: () => import('../services/clientesService').then(m => m.getConfigCamposClientes()),
    staleTime: STALE_CLIENT,
    gcTime: STALE_CLIENT * 2,
  });

  // ── Mutation: actualizar cliente ───────────────────────────────────────────
  const updateClientMutation = useMutation({
    mutationFn: (updateData) => updateCliente(clientId, updateData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
    },
  });

  // ── Estado agregado de carga y errores ─────────────────────────────────────
  const isLoading =
    clientQuery.isLoading ||
    relationsQuery.isLoading ||
    documentsQuery.isLoading ||
    entradasQuery.isLoading ||
    formulariosQuery.isLoading;

  const isError =
    clientQuery.isError ||
    relationsQuery.isError ||
    documentsQuery.isError ||
    entradasQuery.isError ||
    formulariosQuery.isError;

  const error =
    clientQuery.error ||
    relationsQuery.error ||
    documentsQuery.error ||
    entradasQuery.error ||
    formulariosQuery.error ||
    duplicateContactsQuery.error;

  return {
    // Datos
    client: clientQuery.data,
    relations: relationsQuery.data ?? [],
    documents: documentsQuery.data ?? [],
    entradas: entradasQuery.data ?? [],
    formularios: formulariosQuery.data ?? [],
    duplicateContacts: duplicateContactsQuery.data ?? [],
    customFieldsConfig: customFieldsConfigQuery.data ?? [],

    // Estado
    isLoading,
    isError,
    error,

    // Mutaciones
    updateClient: updateClientMutation.mutate,
    isUpdating: updateClientMutation.isPending,
  };
};

export default useClientData;