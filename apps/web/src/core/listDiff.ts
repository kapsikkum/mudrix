import type { ListDiff } from '@wizardchat/core';

/** Applies the core's list diffs to an immutable array, returning a new one. */
export function applyDiffs<T>(list: readonly T[], diffs: ListDiff<T>[]): T[] {
  let next = list.slice();
  for (const diff of diffs) {
    switch (diff.op) {
      case 'append':
        next.push(...diff.values);
        break;
      case 'clear':
        next = [];
        break;
      case 'pushFront':
        next.unshift(diff.value);
        break;
      case 'pushBack':
        next.push(diff.value);
        break;
      case 'popFront':
        next.shift();
        break;
      case 'popBack':
        next.pop();
        break;
      case 'insert':
        next.splice(diff.index, 0, diff.value);
        break;
      case 'set':
        next[diff.index] = diff.value;
        break;
      case 'remove':
        next.splice(diff.index, 1);
        break;
      case 'truncate':
        next.length = Math.min(next.length, diff.length);
        break;
      case 'reset':
        next = diff.values.slice();
        break;
    }
  }
  return next;
}
