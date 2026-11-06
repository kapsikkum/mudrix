import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HAS_EXTENSION = /\.(?:ts|tsx|js|mjs|cjs|json)$/;

export function resolve(specifier, context, nextResolve) {
  if (
    specifier.startsWith('.') &&
    !HAS_EXTENSION.test(specifier) &&
    context.parentURL?.startsWith('file:')
  ) {
    const url = new URL(specifier, context.parentURL);
    for (const ext of ['.ts', '/index.ts']) {
      const candidate = new URL(url.href + ext);
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
    }
  }
  return nextResolve(specifier, context);
}
