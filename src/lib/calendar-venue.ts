export type RegisteredVenue = { key: string; label: string };

const normalized = (value: string) => value.trim().normalize("NFKC").toLowerCase().replace(/\s+/g, " ");

/** Resolve only exact registered keys or unambiguous display names, never guessed venues. */
export function resolveCalendarVenue(value: string, venues: readonly RegisteredVenue[]): string {
  const key = venues.find((venue) => venue.key === value);
  if (key) return key.key;
  const matches = venues.filter((venue) => normalized(venue.label) === normalized(value));
  return matches.length === 1 ? matches[0].key : value;
}