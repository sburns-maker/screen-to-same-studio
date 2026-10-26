import { CHARACTERS, type CharacterKey } from "./characters";

/** Stable hourly choices: polling never rerolls and contacts retain distinct tendencies.
 * Keep the existing 12% base rate until production execution/configuration is verified.
 */
export function incomingCallSelection(user: string, key: CharacterKey, now: Date) {
  const slot = Math.floor(now.getTime() / 3_600_000);
  let hash = 2166136261;
  for (const ch of `${user}:${key}:${slot}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const draw = (hash >>> 0) / 4294967296;
  const chance = Math.min(1, Math.max(0, 0.12 * CHARACTERS[key].initiation.scoreMultiplier));
  return { selected: draw <= chance, chance, draw };
}
