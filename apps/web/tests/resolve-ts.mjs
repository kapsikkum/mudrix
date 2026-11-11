import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HAS_EXTENSION = /\.(?:ts|tsx|js|mjs|cjs|json)$/;
const SRC = new URL('../src/', import.meta.url);

export function resolve(specifier, context, nextResolve) {
  const aliased = specifier.startsWith('@/');
  if (
    (aliased || specifier.startsWith('.')) &&
    !HAS_EXTENSION.test(specifier) &&
    (aliased || context.parentURL?.startsWith('file:'))
  ) {
    const url = aliased ? new URL(specifier.slice(2), SRC) : new URL(specifier, context.parentURL);
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      const candidate = new URL(url.href + ext);
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
    }
  }
  return nextResolve(specifier, context);
}
