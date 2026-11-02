import { errorCode } from '@/core/client';

export function matrixErrcode(error: unknown): string | undefined {
  if (errorCode(error) !== 'matrix') return undefined;
  const errcode = (error as { errcode?: unknown }).errcode;
  return typeof errcode === 'string' ? errcode : undefined;
}
