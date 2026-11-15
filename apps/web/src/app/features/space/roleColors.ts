/**
 * Role colours without any React or room data: which colour a name gets.
 *
 * Kept apart from `spaceRoles.ts` so the precedence rules can be tested on their own (and reused
 * by reply previews and thread rows).
 */

/** The roles every Matrix room already has, by power level. They cannot be removed or moved. */
export const BUILTIN_ROLE_KEYS = ['founder', '100', '50', '0'] as const;
export type BuiltinRoleKey = (typeof BUILTIN_ROLE_KEYS)[number];

export interface RoleColorLook {
  color?: string;
}

/** What the colour rules need from a space's roles. */
export interface RoleColors {
  builtin: Partial<Record<BuiltinRoleKey, RoleColorLook>>;
  /** Roles per person, in display order. */
  byUser: Map<string, ReadonlyArray<RoleColorLook>>;
}

/**
 * The colour to show for someone: their Admin/Moderator look first, then their own roles from the
 * top of the list, then the plain Member look. Founders fall back to the Admin look.
 */
export function roleColorOf(
  roles: RoleColors,
  userId: string,
  builtinKey: BuiltinRoleKey = '0'
): string | undefined {
  let high: string | undefined;
  if (builtinKey === 'founder') high = roles.builtin.founder?.color ?? roles.builtin['100']?.color;
  else if (builtinKey !== '0') high = roles.builtin[builtinKey]?.color;
  return (
    high ?? roles.byUser.get(userId)?.find((role) => role.color)?.color ?? roles.builtin['0']?.color
  );
}
