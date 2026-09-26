import { supabase } from '@shared/config/supabaseClient';

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// Las 8 etapas reales del pipeline Comercial de Kommo (14489115), en el orden
// del tablero. "Incoming leads" (sin calificar aún) no se muestra como columna
// propia — son pocos y quedan agrupados con "Bienvenida y Confianza" en la vista.
export const ETAPAS_COMERCIAL = [
  { statusId: 111918875, nombre: 'Bienvenida y Confianza', position: 20 },
  { statusId: 111918879, nombre: 'Calificación de Necesidad', position: 30 },
  { statusId: 111918883, nombre: 'Propuesta y Precio', position: 40 },
  { statusId: 111919155, nombre: 'Datos y Pago (PIX)', position: 50 },
  { statusId: 111919159, nombre: 'Pago Confirmado/esperando documentos', position: 60 },
  { statusId: 111919167, nombre: 'Seguimiento (Sin Respuesta)', position: 70 },
  { statusId: 112025771, nombre: 'RECUPERACION INSTANTANEA', position: 80 },
  { statusId: 142, nombre: 'Logrado con éxito', position: 10000 },
  { statusId: 143, nombre: 'Descalificado / Perdido', position: 11000 },
];

export async function getComercialLeads() {
  return must(await supabase
    .from('comercial_leads')
    .select('id, kommo_lead_id, client_id, nombre, telefono, tramite_texto, precio, etapa_status_id, etapa_nombre, etapa_position, updated_at')
    .order('etapa_position', { ascending: true })
    .order('updated_at', { ascending: false }));
}

export async function moverEtapaLead(kommoLeadId, etapa) {
  const { data, error } = await supabase.functions.invoke('mover-etapa-comercial', {
    body: { kommo_lead_id: kommoLeadId, status_id: etapa.statusId, etapa_nombre: etapa.nombre, etapa_position: etapa.position },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
