import { atom } from 'jotai';
import type { UtdReason } from '@wizardchat/core';

/** Runs of at least this many consecutive undecryptable messages are folded into one row. */
export const UNDECRYPTABLE_RUN_THRESHOLD = 3;

/** Rooms in which the user chose to see every undecryptable message instead of the folded row. */
export const expandedUndecryptableRoomsAtom = atom<ReadonlySet<string>>(new Set<string>());

/** How many consecutive pages that are (nearly) all unreadable stop scrollback by itself. */
export const UNREADABLE_PAGES_BEFORE_PAUSE = 2;
/** The share of a page that has to be unreadable for it to count. */
const UNREADABLE_PAGE_SHARE = 0.9;

export type UndecryptableHelpKind =
  'notJoined' | 'withheld' | 'senderUntrusted' | 'unverified' | 'noBackup' | 'waiting';

/**
 * What to tell someone whose message cannot be read. Some causes no action here can fix; for the
 * rest the first thing to look at is whether this session is verified (an unverified one is not
 * given the keys), then whether a backup exists at all.
 */
export function undecryptableHelpKind(
  reason: UtdReason | null,
  sessionVerified: boolean
): UndecryptableHelpKind {
  switch (reason) {
    case 'sentBeforeWeJoined':
      return 'notJoined';
    case 'withheldBySender':
      return 'withheld';
    case 'verificationViolation':
    case 'unsignedDevice':
    case 'unknownDevice':
      return 'senderUntrusted';
    default:
      break;
  }
  if (!sessionVerified) return 'unverified';
  return reason === 'historicalMessageAndBackupIsDisabled' ? 'noBackup' : 'waiting';
}

export interface UndecryptableRun {
  /** Number of undecryptable messages in the run this one belongs to. */
  count: number;
  /** True for the first (oldest) message of the run. */
  isFirst: boolean;
}

interface RunItem {
  eventId: string;
  isUndecryptable: boolean;
}

/** Every run of consecutive undecryptable messages, in one pass, keyed by event id. */
export function computeUndecryptableRuns(
  items: readonly RunItem[]
): ReadonlyMap<string, UndecryptableRun> {
  const runs = new Map<string, UndecryptableRun>();
  let current: string[] = [];
  const flush = () => {
    const ids = current;
    ids.forEach((id, i) => runs.set(id, { count: ids.length, isFirst: i === 0 }));
    current = [];
  };
  for (const item of items) {
    if (item.isUndecryptable) current.push(item.eventId);
    else flush();
  }
  flush();
  return runs;
}

/**
 * Whether a page of freshly loaded history is (nearly) all messages this device cannot read.
 * `added` is how many events came in at the top, `unreadable` how many of those could not be
 * decrypted.
 */
export function isUnreadablePage(added: number, unreadable: number): boolean {
  return added > 0 && unreadable >= added * UNREADABLE_PAGE_SHARE;
}
