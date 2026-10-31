/**
 * Fair, stable ordering for one world-tick page.
 *
 * The page is already capped at MAX_USERS_PER_RUN conversations. NEVER drop
 * conversations just because one account has more than five characters: with
 * fewer than a full page the durable cursor resets to zero and those extra
 * characters would otherwise never be visited.
 *
 * A fixed 30-minute rotation balances the separate 4-call AI budget across
 * characters (and across accounts sharing a page). Repeated polls in the same
 * window keep their ordering; all eligibility, quiet hours and character
 * choices remain unchanged.
 */
export function fairWorldConversationGroups<T extends { user_id: string }>(
  rows: readonly T[],
  now: Date,
  intervalMinutes = 30,
): [string, T[]][] {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const items = grouped.get(row.user_id) ?? [];
    items.push(row);
    grouped.set(row.user_id, items);
  }
  const slot = Math.floor(now.getTime() / (intervalMinutes * 60_000));
  const rotate = <U>(values: U[]): U[] => {
    if (values.length < 2) return values;
    const offset = ((slot % values.length) + values.length) % values.length;
    return [...values.slice(offset), ...values.slice(0, offset)];
  };
  return rotate([...grouped].map(([userId, items]): [string, T[]] => [
    userId, rotate(items),
  ]));
}
