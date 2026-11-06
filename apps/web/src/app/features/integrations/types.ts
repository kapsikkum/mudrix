import type {
  Capability,
  Integration,
  IntegrationSetting,
  Permissions,
  RejectedIntegration,
} from './manifest';

export interface RepositoryRecord {
  /** The URL actually fetched (a github.com URL is stored as its raw repo.json URL). */
  url: string;
  name: string;
  addedAt: number;
  lastFetchedAt: number | null;
  integrations: Integration[];
  /** Entries this Mudrix can not use (never installable), with the reason. */
  rejected?: RejectedIntegration[];
  /** The pinned signing key (base64 of the raw 32 bytes), trusted on first use. */
  key: string;
  /** Grouped hex fingerprint of `key`. */
  fingerprint: string;
  /** Highest serial seen; a lower one is refused. */
  serial: number;
  /** The pinned key is one built into the app. */
  official: boolean;
  /** When the user pinned the key. */
  trustedAt: number;
  /** Why the last fetch failed; the previous integrations are kept. */
  error?: string;
  /** The last fetch was signed by a different key than the pinned one and was refused. */
  keyChanged?: boolean;
}

export interface PendingUpdate {
  version: string;
  name: string;
  description: string;
  iconUrl?: string;
  /** Not in force until approved. */
  permissions: Permissions;
  settings?: IntegrationSetting[];
}

export interface InstalledIntegration {
  id: string;
  repoUrl: string;
  name: string;
  description: string;
  version: string;
  iconDataUrl?: string;
  /** Exactly what the user approved. Only this is ever acted on. */
  permissions: Permissions;
  /** The setting declarations approved with those permissions (values: integrations.settings). */
  settings?: IntegrationSetting[];
  enabled: boolean;
  approvedAt: number;
  /** The repository it came from was removed. */
  sourceGone?: boolean;
  /** Fingerprint of the repository's pinned key when installed (kept in sync on refresh). */
  publisherFingerprint?: string;
  /** The repository's key was the official one. */
  official?: boolean;
  pendingUpdate?: PendingUpdate;
  /** Its repository now lists a version this Mudrix can not use; the approved one keeps working. */
  blockedUpdate?: { reason: RejectedIntegration['reason']; error: string };
}

/** Per integration id: capability -> still granted. Missing means not granted. */
export type GrantMap = Record<string, Partial<Record<Capability, boolean>>>;
