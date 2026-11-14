const BASE = import.meta.env.BASE_URL;

/** Router basename for deployments under a subpath (e.g. GitHub Pages); undefined at the root. */
export const ROUTER_BASENAME: string | undefined =
  BASE === '/' ? undefined : BASE.replace(/\/$/, '');

/** Absolute URL path for a file in /public or a full-page app route, honouring the deploy base. */
export function publicUrl(path: string): string {
  return BASE + path.replace(/^\//, '');
}

/** Converts a full-page pathname back to a router path by removing the deploy base. */
export function stripBase(pathname: string): string {
  if (!ROUTER_BASENAME || !pathname.startsWith(ROUTER_BASENAME)) return pathname;
  return pathname.slice(ROUTER_BASENAME.length) || '/';
}
