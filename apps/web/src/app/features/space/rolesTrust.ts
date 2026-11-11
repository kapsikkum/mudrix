/** Roles only count when set by someone at least this powerful, whatever the room allows. */
export const MIN_WRITER_LEVEL = 50;

interface PowerLevelsContent {
  users?: Record<string, number>;
  users_default?: number;
  events?: Record<string, number>;
  state_default?: number;
}

/**
 * Whether `sender` could change this kind of state in the space, now. Creators always can; anyone
 * else needs the level the room asks for the event type, and at least `MIN_WRITER_LEVEL` whatever
 * the room allows. A role event from anyone else is ignored: roles are cosmetic, but they must
 * not be set by people with no say over the space.
 */
export function mayChangeSpace(
  powerLevels: Record<string, unknown> | undefined,
  creators: ReadonlySet<string> | readonly string[],
  sender: string | undefined,
  type: string
): boolean {
  if (!sender) return false;
  if (creators instanceof Set ? creators.has(sender) : (creators as string[]).includes(sender)) {
    return true;
  }
  const levels = powerLevels as PowerLevelsContent | undefined;
  if (!levels) return false;
  const level = levels.users?.[sender] ?? levels.users_default ?? 0;
  const needed = levels.events?.[type] ?? levels.state_default ?? 50;
  return level >= Math.max(needed, MIN_WRITER_LEVEL);
}
