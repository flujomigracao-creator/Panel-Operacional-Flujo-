import { supabase } from '@shared/config/supabaseClient';
import { getMyOrganizationId } from '@features/crm/services/crmService';

const must = ({ data, error }) => { if (error) throw error; return data; };

/** Todas las publicaciones de la organización (RLS), de la más próxima a la más lejana. */
export async function listPublicaciones() {
  return must(await supabase.from('publicaciones').select('*').order('programada_at', { ascending: true }));
}

export async function updatePublicacion(id, patch) {
  return must(await supabase.from('publicaciones').update(patch).eq('id', id).select().single());
}

export async function createPublicacion(campos) {
  const organization_id = await getMyOrganizationId();
  return must(await supabase.from('publicaciones').insert({ organization_id, ...campos }).select().single());
}
