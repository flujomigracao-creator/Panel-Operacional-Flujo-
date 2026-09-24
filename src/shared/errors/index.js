/**
 * Clases de error semánticas centralizadas.
 * Siguiendo el patrón del SaaS Architect skill.
 * 
 * Uso:
 *   import { NotFoundError, ConflictError } from '@/shared/errors';
 *   throw new NotFoundError('Cliente');
 */

export class AppError extends Error {
  constructor(message, code = 'APP_ERROR', isOperational = true) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.isOperational = isOperational;
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Recurso') {
    super(`${resource} no encontrado`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Ya existe un registro con esos datos') {
    super(message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Datos inválidos', fields = {}) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autorizado') {
    super(message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acceso denegado') {
    super(message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NetworkError extends AppError {
  constructor(message = 'Error de conexión') {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

/**
 * handleServiceError — Manejo centralizado de errores de Supabase.
 * Convierte errores de Supabase en errores semánticos de la app.
 */
export function handleServiceError(error, context = '') {
  const prefix = context ? `[${context}] ` : '';
  
  if (error?.code === 'PGRST116') {
    throw new NotFoundError(context || 'Recurso');
  }
  
  if (error?.code === '23505') {
    throw new ConflictError(`${prefix}Ya existe un registro duplicado`);
  }
  
  if (error?.code === '23503') {
    throw new ValidationError(`${prefix}Referencia inválida — el recurso referenciado no existe`);
  }
  
  if (error?.message?.includes('JWT')) {
    throw new UnauthorizedError(`${prefix}Sesión expirada — inicia sesión nuevamente`);
  }

  // Error genérico
  console.error(`${prefix}Error no manejado:`, error);
  throw new AppError(
    error?.message || `${prefix}Error inesperado`,
    'UNKNOWN_ERROR',
    false
  );
}
