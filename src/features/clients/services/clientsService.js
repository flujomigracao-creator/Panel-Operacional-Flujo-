import { supabase } from '@shared/config/supabaseClient';

const PAGE_SIZE = 1000;

export const KOMMO_CONTACT_URL = (contactId) => `https://flujomigracao.kommo.com/contacts/detail/${contactId}`;
export const KOMMO_LEAD_URL = (leadId) => `https://flujomigracao.kommo.com/leads/detail/${leadId}`;

export const CLIENT_STATUS = {
  lead: { label: 'Lead', tone: 'sky' },
  contacted: { label: 'Contactado', tone: 'amber' },
  active: { label: 'Activo', tone: 'green' },
  inactive: { label: 'Inactivo', tone: 'zinc' },
  vip: { label: 'VIP', tone: 'amber' },
};

export const TRAMITE_STATUS = {
  pending: { label: 'Pendiente', tone: 'amber' },
  in_progress: { label: 'En curso', tone: 'sky' },
  on_hold: { label: 'En pausa', tone: 'amber' },
  completed: { label: 'Concluido', tone: 'green' },
  cancelled: { label: 'Cancelado', tone: 'zinc' },
};

export const isActiveTramite = (t) => ['pending', 'in_progress', 'on_hold'].includes(t.status);

/**
 * Todos los clientes con sus trámites (vista `painel_clientes`). Supabase corta
 * cada request en 1000 filas, así que se pagina hasta traerlos todos.
 */
export async function getClients() {
  let all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('painel_clientes')
      .select('id, full_name, phone, email, nationality, status, lead_source, kommo_contact_id, created_at, last_activity_at, tramites, tramites_activos, documentos_por_revisar, mensajes')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
  }
  return all;
}
