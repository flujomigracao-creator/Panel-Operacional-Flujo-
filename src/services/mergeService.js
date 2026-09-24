import { supabase } from '../supabaseClient';

// Campos que ya no son columnas reales de `clientes` (se movieron a
// campos_personalizados JSONB, ver clientView.constants.js FIXED_FIELDS_CATALOG
// vs. config_campos_clientes) — si vinieran en `mergedData` como columnas
// sueltas, un .update() plano los escribiría en columnas que ya nadie lee.
const DYNAMIC_MERGE_FIELDS = new Set([
    'rnm', 'numero_refugio', 'fecha_vencimiento_refugio', 'numero_pasaporte',
    'fecha_emision_pasaporte', 'fecha_vencimiento_pasaporte', 'carnet_identidad',
    'policia_federal', 'fecha_entrada_brasil', 'lugar_entrada_brasil',
    'nombre_madre', 'nombre_padre', 'tramite',
]);

// Tablas con ON DELETE CASCADE hacia `clientes` (ver database/standalone/001_schema.sql).
// Si no se reasignan antes de borrar el duplicado, Postgres las borra en
// cascada junto con él — se perdían silenciosamente chats, documentos
// pendientes, notificaciones, formularios e historial en cada fusión.
const CASCADE_CHILD_TABLES = [
    { table: 'documentos_operacionales', column: 'id_cliente' },
    { table: 'historial_clientes', column: 'cliente_id' },
    { table: 'mensajes', column: 'cliente_id' },
    { table: 'ai_chats', column: 'cliente_id' },
    { table: 'documentos_pendientes', column: 'cliente_id' },
    { table: 'notificaciones_equipo', column: 'cliente_id' },
    { table: 'entradas', column: 'id_cliente' },
    { table: 'formularios_clientes', column: 'cliente_id' },
    { table: 'historial_cambios', column: 'id_cliente' },
];

// Función para fusionar múltiples contactos (2 o más)
export const mergeContacts = async (keepContactId, contactIdsToDelete, mergedData) => {
    try {
        if (!Array.isArray(contactIdsToDelete)) {
            contactIdsToDelete = [contactIdsToDelete];
        }

        // Validar que hay contactos a eliminar
        if (contactIdsToDelete.length === 0) {
            throw new Error('Debe proporcionar al menos un contacto para eliminar');
        }

        // Transferir todos los datos relacionados de los contactos a eliminar al contacto a mantener
        for (const contactToDelete of contactIdsToDelete) {
            for (const { table, column } of CASCADE_CHILD_TABLES) {
                await supabase
                    .from(table)
                    .update({ [column]: keepContactId })
                    .eq(column, contactToDelete);
            }

            // relaciones_clientes referencia a `clientes` por dos columnas
            await supabase
                .from('relaciones_clientes')
                .update({ cliente_id: keepContactId })
                .eq('cliente_id', contactToDelete);

            await supabase
                .from('relaciones_clientes')
                .update({ cliente_relacionado_id: keepContactId })
                .eq('cliente_relacionado_id', contactToDelete);
        }

        // Eliminamos los contactos duplicados
        for (const contactToDelete of contactIdsToDelete) {
            const { error: deleteError } = await supabase
                .from('clientes')
                .delete()
                .eq('id', contactToDelete);

            if (deleteError) {
                console.error(`Error al eliminar contacto ${contactToDelete}:`, deleteError);
            }
        }

        // Separar los campos que viven en campos_personalizados (JSONB) de las
        // columnas reales — mergeados aparte para no pisar otras claves que ya
        // tuviera guardadas el contacto que se mantiene.
        const flatData = {};
        const dynamicData = {};
        for (const [key, value] of Object.entries(mergedData)) {
            if (DYNAMIC_MERGE_FIELDS.has(key)) {
                dynamicData[key] = value;
            } else {
                flatData[key] = value;
            }
        }

        if (Object.keys(dynamicData).length > 0) {
            const { data: currentClient } = await supabase
                .from('clientes')
                .select('campos_personalizados')
                .eq('id', keepContactId)
                .single();
            flatData.campos_personalizados = { ...(currentClient?.campos_personalizados || {}), ...dynamicData };
        }

        // Actualizar el contacto que se va a mantener con los datos fusionados (se hace al final para evitar conflictos de campos únicos)
        const { error: updateError } = await supabase
            .from('clientes')
            .update(flatData)
            .eq('id', keepContactId);

        if (updateError) {
            console.error('Detalles del error de actualización (Supabase):', updateError);
            throw new Error(`Error al actualizar el contacto fusionado: ${updateError.message || JSON.stringify(updateError)}`);
        }

        return { success: true, keptContactId: keepContactId, mergedCount: contactIdsToDelete.length };
    } catch (error) {
        console.error('Error en la fusión de contactos:', error);
        return { success: false, error: error.message };
    }
};