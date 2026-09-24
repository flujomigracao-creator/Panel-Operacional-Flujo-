/**
 * Re-export de supabaseClient desde su nueva ubicación.
 * Mantiene compatibilidad con imports existentes: import { supabase } from './supabaseClient'
 * TODO: Migrar todos los imports a '../shared/config/supabaseClient' y eliminar este archivo.
 */
export { supabase } from './shared/config/supabaseClient';
