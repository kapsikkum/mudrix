/**
 * How the software a homeserver runs is drawn on a profile card. The lookup itself is the
 * core's `homeserverSoftware` call (the server is asked directly, never a third party).
 */
import type { WizardClient as MatrixClient, HomeserverSoftware } from '@wizardchat/core';

export type { HomeserverSoftware };

export interface KnownSoftware {
  label: string;
  /** Brand colour of the badge. */
  color: string;
  /** One or two characters drawn on the badge when there is no logo. */
  glyph: string;
  /** Logo file in `public/assets/homeservers/`. */
  logo?: string;
  /** Drawn instead of a logo file. */
  emoji?: string;
}

const KNOWN: Record<string, KnownSoftware> = {
  synapse: { label: 'Synapse', color: '#0dbd8b', glyph: 'S', logo: 'synapse.svg' },
  dendrite: { label: 'Dendrite', color: '#6c5ce7', glyph: 'D' },
  conduit: { label: 'Conduit', color: '#f59e0b', glyph: 'C', logo: 'conduit.svg' },
  conduwuit: { label: 'Conduwuit', color: '#ec008c', glyph: 'Cw', logo: 'conduwuit.svg' },
  continuwuity: { label: 'Continuwuity', color: '#f472b6', glyph: 'Ct', logo: 'continuwuity.svg' },
  tuwunel: { label: 'Tuwunel', color: '#f472b6', glyph: 'T', emoji: '\u{1F495}' },
  grapevine: { label: 'Grapevine', color: '#a855f7', glyph: 'G' },
  construct: { label: 'Construct', color: '#64748b', glyph: 'Co' },
  telodendria: { label: 'Telodendria', color: '#84cc16', glyph: 'Te' },
  palpo: { label: 'Palpo', color: '#ef4444', glyph: 'P' },
};

/** How a software name is drawn; unknown servers get a neutral badge with their initial. */
export function describeSoftware(name: string): KnownSoftware {
  const known = KNOWN[name.trim().toLowerCase()];
  if (known) return known;
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return { label: name.trim().slice(0, 32), color: '#6b7280', glyph: initial };
}

/** The server name of a user ID (`@user:example.org` -> `example.org`). */
export function serverNameOf(userId: string): string {
  return userId.split(':').slice(1).join(':');
}

const cache = new WeakMap<MatrixClient, Map<string, Promise<HomeserverSoftware | null>>>();

/** What a server runs, asked once per server and session; null when it can't be asked. */
export function getHomeserverSoftware(
  client: MatrixClient,
  serverName: string
): Promise<HomeserverSoftware | null> {
  let perClient = cache.get(client);
  if (!perClient) {
    perClient = new Map();
    cache.set(client, perClient);
  }
  const key = serverName.toLowerCase();
  let pending = perClient.get(key);
  if (!pending) {
    pending = client.homeserverSoftware(key).catch(() => null);
    perClient.set(key, pending);
  }
  return pending;
}
