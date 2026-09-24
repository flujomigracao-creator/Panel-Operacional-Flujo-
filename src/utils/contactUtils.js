import { supabase } from '../supabaseClient';

export const findDuplicateContacts = async (telefono, currentClientId = null) => {
    if (!telefono) return [];

    const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .ilike('telefono', `%${telefono}%`)
        .neq('telefono', ''); // Excluir registros con teléfono vacío

    if (error) {
        console.error('Error buscando contactos duplicados:', error);
        return [];
    }

    // Filtrar solo los contactos que tienen exactamente el mismo número de teléfono
    const normalizedTelefono = telefono.replace(/\D/g, ''); // Remover todos los caracteres no numéricos
    let duplicates = data.filter(contact => {
        const contactNormalized = contact.telefono?.replace(/\D/g, '') || '';
        return contactNormalized === normalizedTelefono && contact.telefono;
    });

    if (currentClientId && duplicates.length > 1) {
        // Obtenemos los relacionamientos de currentClientId
        const { data: relaciones, error: relError } = await supabase
            .from('relaciones_clientes')
            .select('*')
            .or(`cliente_id.eq.${currentClientId},cliente_relacionado_id.eq.${currentClientId}`);

        if (relError) {
            console.error('Error fetching relations in findDuplicateContacts:', relError);
        }

        if (relaciones && relaciones.length > 0) {
            const relatedIds = new Set();
            relaciones.forEach(rel => {
                relatedIds.add(String(rel.cliente_id));
                relatedIds.add(String(rel.cliente_relacionado_id));
            });

            // Filtramos los duplicados excluyendo a aquellos que estén relacionados
            duplicates = duplicates.filter(contact => {
                if (String(contact.id) === String(currentClientId)) return true; // Mantener el cliente actual
                if (relatedIds.has(String(contact.id))) return false;    // Excluir si es un relacionamiento
                return true;
            });
        }
    }

    return duplicates;
};

// Función para obtener todos los contactos duplicados en el sistema
export const findAllDuplicateContacts = async () => {
    const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, telefono, email, cpf')
        .neq('telefono', '')
        .not('telefono', 'is', null);

    if (error) {
        console.error('Error obteniendo todos los contactos:', error);
        return [];
    }

    // Agrupar contactos por número de teléfono normalizado
    const phoneGroups = {};
    data.forEach(contact => {
        if (contact.telefono) {
            const normalizedPhone = contact.telefono.replace(/\D/g, '');
            if (!phoneGroups[normalizedPhone]) {
                phoneGroups[normalizedPhone] = [];
            }
            phoneGroups[normalizedPhone].push(contact);
        }
    });

    // Devolver solo grupos con más de un contacto (duplicados)
    const duplicateGroups = Object.values(phoneGroups).filter(group => group.length > 1);
    return duplicateGroups.flat(); // Convertir a array plano de contactos duplicados
};