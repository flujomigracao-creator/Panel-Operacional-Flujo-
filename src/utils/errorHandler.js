import { toast } from 'react-hot-toast';

export const handleError = (error, context = 'Error') => {
  console.error(`[${context}]`, error);
  const message = error?.message || 'Ha ocurrido un error inesperado.';
  toast.error(`${context}: ${message}`);
};

/**
 * FunctionsHttpError (supabase.functions.invoke) siempre trae el mensaje
 * genérico "Edge Function returned a non-2xx status code" — el detalle real
 * que devuelve el body JSON del edge function vive en error.context (la
 * Response cruda, sin consumir).
 */
export const extractFunctionErrorMessage = async (error) => {
  try {
    const body = await error.context?.json();
    if (body?.error) return body.error;
  } catch (__) {
    // context no era JSON o ya se consumió; usamos el mensaje genérico.
  }
  return error.message;
};
