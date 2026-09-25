// Ejecución de propuestas confirmadas. Sin IA: cada tipo tiene un handler determinista.
// Corre con service role, pero todo se limita a la organización y se registra.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { CLIENT_FIELDS, ORG_ID } from './tools.ts';

async function must<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

// dd/mm/aaaa → aaaa-mm-dd (para columnas date)
const toIsoDate = (v: string) => {
  const m = String(v).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : v;
};

const STAGES_STD = [
  ['PAGO_CONFIRMADO', 0, 'PAGO_CONFIRMADO'], ['AGUARDANDO_DOCUMENTOS', 1, 'AGUARDANDO_DOCUMENTOS'],
  ['DOCUMENTACAO_COMPLETA', 2, 'EM_REVISAO'], ['ENVIADO', 3, 'ENVIADO_AO_ORGAO'],
  ['AGUARDANDO_RESPOSTA', 4, 'AGUARDANDO_RESPOSTA'], ['PRONTO_PARA_ENTREGAR', 5, 'LISTO_PARA_ENTREGAR'],
  ['CONCLUIDO', 6, 'CONCLUIDO'], ['CORRECAO', 7, 'PROBLEMA'],
] as const;

async function caso(admin: SupabaseClient, id: string) {
  const c = await must(admin.from('client_services').select('id, service_id, client_id, kommo_lead_id, organization_id').eq('id', id).maybeSingle()) as any;
  if (!c || c.organization_id !== ORG_ID) throw new Error('Trámite no encontrado');
  return c;
}

async function evento(admin: SupabaseClient, clientServiceId: string, tipo: string, metadata: Record<string, unknown>) {
  await admin.from('client_service_events').insert({ organization_id: ORG_ID, client_service_id: clientServiceId, event_type: tipo, metadata: { ...metadata, origem: 'asistente' } });
}

export async function executeProposal(admin: SupabaseClient, userId: string, p: any, opciones: any = {}): Promise<Record<string, unknown>> {
  const d = p.payload || {};
  switch (p.tipo) {
    case 'cambiar_etapa': {
      const c = await caso(admin, d.client_service_id);
      const st = await must(admin.from('service_stages').select('id, name, pipeline_stage_code, service_id').eq('id', d.stage_id).single()) as any;
      if (st.service_id !== c.service_id) throw new Error('La etapa no corresponde al trámite');
      const status = st.pipeline_stage_code === 'CONCLUIDO' ? 'completed' : st.pipeline_stage_code === 'PROBLEMA' ? 'on_hold' : 'in_progress';
      await must(admin.from('client_services').update({ stage_id: st.id, status, completed_at: status === 'completed' ? new Date().toISOString() : null }).eq('id', c.id));
      return { ok: true, etapa: st.name, reflejado_en_kommo: !!c.kommo_lead_id };
    }
    case 'cambiar_estado_tramite': {
      const c = await caso(admin, d.client_service_id);
      await must(admin.from('client_services').update({ status: d.estado, completed_at: d.estado === 'completed' ? new Date().toISOString() : null }).eq('id', c.id));
      await evento(admin, c.id, 'updated', { estado: d.estado });
      return { ok: true, estado: d.estado };
    }
    case 'revisar_documento': {
      const doc = await must(admin.from('documents').select('id, organization_id, client_service_id').eq('id', d.document_id).maybeSingle()) as any;
      if (!doc || doc.organization_id !== ORG_ID) throw new Error('Documento no encontrado');
      await must(admin.from('documents').update({ status: d.aprobar ? 'approved' : 'rejected', reviewed_by: userId, review_notes: d.motivo || null }).eq('id', doc.id));
      if (doc.client_service_id) await evento(admin, doc.client_service_id, d.aprobar ? 'document_approved' : 'document_rejected', { motivo: d.motivo || null });
      return { ok: true };
    }
    case 'crear_tarea': {
      const t = await must(admin.from('tasks').insert({
        organization_id: ORG_ID, title: d.titulo, details: d.detalles, priority: d.prioridad || 'normal',
        due_at: d.vence_en || null, client_id: d.client_id || null, kind: 'outro', source: 'asistente',
      }).select('id').single()) as any;
      return { ok: true, task_id: t.id };
    }
    case 'cerrar_tarea': {
      await must(admin.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', d.task_id).eq('organization_id', ORG_ID));
      return { ok: true };
    }
    case 'guardar_datos': {
      // En la tarjeta el usuario puede desmarcar filas: opciones.filas = índices elegidos
      const elegidas: number[] = Array.isArray(opciones.filas) ? opciones.filas : (d.filas || []).map((f: any, i: number) => (f.seleccionado ? i : -1)).filter((i: number) => i >= 0);
      const guardados: string[] = [];
      for (const i of elegidas) {
        const f = d.filas?.[i];
        if (!f) continue;
        if (f.destino === 'cliente') {
          if (!CLIENT_FIELDS[f.campo]) continue;
          const valor = f.campo === 'birth_date' ? toIsoDate(f.valor) : f.valor;
          await must(admin.from('clients').update({ [f.campo]: valor }).eq('id', f.client_id).eq('organization_id', ORG_ID));
          guardados.push(CLIENT_FIELDS[f.campo]);
        } else {
          const c = await caso(admin, f.client_service_id);
          const field = await must(admin.from('service_fields').select('id').eq('service_id', c.service_id).eq('name', f.campo).maybeSingle()) as any;
          if (!field) continue;
          await must(admin.from('client_service_field_values').upsert(
            { organization_id: ORG_ID, client_service_id: c.id, service_field_id: field.id, value: f.valor, updated_at: new Date().toISOString() },
            { onConflict: 'client_service_id,service_field_id' },
          ));
          await evento(admin, c.id, 'data_saved', { salvos: [f.campo] });
          guardados.push(f.label || f.campo);
        }
      }
      return { ok: true, guardados };
    }
    case 'crear_servicio': {
      const existe = await must(admin.from('services').select('id').eq('organization_id', ORG_ID).ilike('name', d.nombre).maybeSingle()) as any;
      if (existe) throw new Error('Ya existe un trámite con ese nombre');
      const pos = ((await must(admin.from('services').select('position').eq('organization_id', ORG_ID).order('position', { ascending: false }).limit(1))) as any[])[0]?.position ?? 0;
      const s = await must(admin.from('services').insert({
        organization_id: ORG_ID, name: d.nombre, description: d.descripcion, default_price: d.precio, currency: 'BRL', category: 'migracao', active: true, position: pos + 1,
      }).select('id').single()) as any;
      await must(admin.from('service_stages').insert(STAGES_STD.map(([name, position, code]) => ({ organization_id: ORG_ID, service_id: s.id, name, position, pipeline_stage_code: code }))));
      return { ok: true, service_id: s.id, nota: 'Para que Kommo lo use, agrega la opción con el mismo nombre en "Trámite solicitado": se enlaza sola.' };
    }
    case 'lista_documentos': {
      const s = await must(admin.from('services').select('id, name').eq('organization_id', ORG_ID).ilike('name', `%${d.servicio}%`).order('position').limit(1).maybeSingle()) as any;
      if (!s) throw new Error('Trámite no encontrado: ' + d.servicio);
      if (d.reemplazar) await must(admin.from('service_requirements').delete().eq('service_id', s.id));
      const base = ((await must(admin.from('service_requirements').select('position').eq('service_id', s.id).order('position', { ascending: false }).limit(1))) as any[])[0]?.position ?? 0;
      let pos = base;
      for (const it of d.items || []) {
        pos++;
        if (it.tipo === 'foto') {
          const code = String(it.codigo).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
          let dt = await must(admin.from('document_types').select('id').eq('name', code).maybeSingle()) as any;
          if (!dt) dt = await must(admin.from('document_types').insert({ organization_id: ORG_ID, name: code, description: it.texto_cliente }).select('id').single());
          await must(admin.from('service_requirements').insert({ organization_id: ORG_ID, service_id: s.id, kind: 'foto', document_type_id: dt.id, required: it.obligatorio !== false, ask_client: true, position: pos, label: it.texto_cliente, ai_instructions: it.instrucciones_ia || null }));
        } else {
          const code = String(it.codigo).replace(/[^A-Za-z0-9_]+/g, '_');
          let sf = await must(admin.from('service_fields').select('id').eq('service_id', s.id).eq('name', code).maybeSingle()) as any;
          if (!sf) sf = await must(admin.from('service_fields').insert({ organization_id: ORG_ID, service_id: s.id, name: code, label: it.texto_cliente, field_type: 'text', required: it.obligatorio !== false, position: pos }).select('id').single());
          await must(admin.from('service_requirements').insert({ organization_id: ORG_ID, service_id: s.id, kind: 'dado', service_field_id: sf.id, required: it.obligatorio !== false, ask_client: true, position: pos, label: it.texto_cliente, ai_instructions: it.instrucciones_ia || null }));
        }
      }
      return { ok: true, servicio: s.name, items: (d.items || []).length };
    }
    case 'respuesta_estandar': {
      const k = await must(admin.from('knowledge_documents').insert({ organization_id: ORG_ID, title: d.titulo, content: d.contenido, category: d.categoria, source_type: 'asistente', status: 'published', created_by: userId }).select('id').single()) as any;
      return { ok: true, id: k.id };
    }
    case 'actualizar_lead_kommo': {
      const token = Deno.env.get('KOMMO_TOKEN');
      if (!token) throw new Error('Falta configurar el secreto KOMMO_TOKEN en Supabase para escribir en Kommo.');
      const base = 'https://flujomigracao.kommo.com/api/v4/';
      const h = { Authorization: token.startsWith('Bearer') ? token : `Bearer ${token}`, 'Content-Type': 'application/json' };
      const cfv: any[] = [];
      const ids: Record<string, number> = { ciudad_br: 193440, pais_origen: 193498, pasaporte: 211064 };
      for (const k of Object.keys(ids)) if (d.campos?.[k]) cfv.push({ field_id: ids[k], values: [{ value: d.campos[k] }] });
      if (d.campos?.tramite) {
        const r = await fetch(base + 'leads/custom_fields/211058', { headers: h });
        const campo = await r.json();
        const op = (campo.enums || []).find((e: any) => e.value.toLowerCase() === String(d.campos.tramite).toLowerCase());
        if (!op) throw new Error('"' + d.campos.tramite + '" no es una opción de "Trámite solicitado" en Kommo');
        cfv.push({ field_id: 211058, values: [{ enum_id: op.id }] });
      }
      const r = await fetch(base + 'leads/' + d.kommo_lead_id, { method: 'PATCH', headers: h, body: JSON.stringify({ custom_fields_values: cfv }) });
      if (!r.ok) throw new Error('Kommo respondió ' + r.status + ': ' + (await r.text()).slice(0, 200));
      return { ok: true };
    }
    case 'relacionar_clientes': {
      const cs = await must(admin.from('clients').select('id').eq('organization_id', ORG_ID).in('id', [d.client_id, d.relacionado_id])) as any[];
      if (cs.length !== 2) throw new Error('Cliente no encontrado');
      const { error } = await admin.from('client_relations').insert({ organization_id: ORG_ID, client_id: d.client_id, related_client_id: d.relacionado_id, tipo: d.tipo, created_by: userId });
      if (error) throw new Error(error.message.includes('duplicate') ? 'Esos clientes ya están relacionados' : error.message);
      return { ok: true };
    }
    case 'agregar_participante': {
      const c = await caso(admin, d.client_service_id);
      if (c.client_id === d.client_id) throw new Error('Esa persona ya es la titular del trámite');
      const { error } = await admin.from('client_service_participants').insert({ organization_id: ORG_ID, client_service_id: c.id, client_id: d.client_id, rol: d.rol });
      if (error) throw new Error(error.message.includes('duplicate') ? 'Esa persona ya está en el trámite' : error.message);
      await evento(admin, c.id, 'updated', { participante_agregado: d.client_id, rol: d.rol });
      return { ok: true };
    }
    case 'generar_documento': {
      const url = Deno.env.get('N8N_DOCS_WEBHOOK');
      const secret = Deno.env.get('N8N_DOCS_SECRET');
      if (!url || !secret) throw new Error('Falta configurar la generación de documentos (N8N_DOCS_WEBHOOK / N8N_DOCS_SECRET).');
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-asistente-secret': secret }, body: JSON.stringify(d) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || body.ok === false) throw new Error(body.erro || ('n8n respondió ' + r.status));
      return { ok: true, ...body };
    }
    default:
      throw new Error('Tipo de propuesta desconocido: ' + p.tipo);
  }
}
