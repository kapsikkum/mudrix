export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;
    if (typeof e.message === 'string') return e.message;
    if (typeof e.error === 'string') return e.error;
    if (typeof e.errcode === 'string') return e.errcode;
  }
  return 'An unknown error occurred';
}

export const MatrixErrorCode = {
  FORBIDDEN: 'M_FORBIDDEN',
  USER_IN_USE: 'M_USER_IN_USE',
  INVALID_USERNAME: 'M_INVALID_USERNAME',
  ROOM_IN_USE: 'M_ROOM_IN_USE',
  INVALID_PARAM: 'M_INVALID_PARAM',
  UNKNOWN: 'M_UNKNOWN',
  NOT_FOUND: 'M_NOT_FOUND',
  LIMIT_EXCEEDED: 'M_LIMIT_EXCEEDED',
  WRONG_ROOM_KEYS_VERSION: 'M_WRONG_ROOM_KEYS_VERSION',
  EXCLUSIVE: 'M_EXCLUSIVE',
  WEAK_PASSWORD: 'M_WEAK_PASSWORD',
} as const;
