import { toast } from 'react-hot-toast';

export const handleError = (error, context = 'Error') => {
  console.error(`[${context}]`, error);
  const message = error?.message || 'Ha ocurrido un error inesperado.';
  toast.error(`${context}: ${message}`);
};
