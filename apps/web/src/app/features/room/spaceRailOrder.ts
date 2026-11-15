/**
 * Puts the spaces a saved rail order names into that order; anything it does not name keeps the
 * place it already had (a space joined since stays where the core put it).
 *
 * The order comes from the old app, which kept it on the device (`wz_space_order`). Kept free of
 * imports so it can be tested on its own.
 */
export function applySpaceOrder<T>(
  items: T[],
  order: readonly string[],
  idOf: (item: T) => string | null | undefined
): T[] {
  if (order.length === 0) return items;
  const position = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const pa = position.get(idOf(a) ?? '');
    const pb = position.get(idOf(b) ?? '');
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return 0;
  });
}
