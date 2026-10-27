import { EngineError } from '@daeef/game-engine';
import { type ErrorCode, type ServerError, ValidationError } from '@daeef/shared';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

/** Maps any thrown value to a safe client-facing error (never leaks internals). */
export function toServerError(error: unknown): ServerError {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  if (error instanceof EngineError) {
    // INVALID_STATE details are internal; everything else is a rule rejection.
    return error.code === 'INVALID_STATE' ? { code: 'INTERNAL', message: 'Internal error' } : { code: error.code, message: error.code };
  }
  if (error instanceof ValidationError) return { code: 'BAD_REQUEST', message: error.message };
  return { code: 'INTERNAL', message: 'Internal error' };
}
