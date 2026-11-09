export type RegisteredVenue = { key: string; label: string };

const normalized = (value: string) => value.trim().normalize("NFKC").toLowerCase().replace(/\s+/g, " ");

/** Resolve only exact registered keys or unambiguous display names, never guessed venues. */
export function resolveCalendarVenue(value: string, venues: readonly RegisteredVenue[]): string {
  const key = venues.find((venue) => venue.key === value);
  if (key) return key.key;
  const matches = venues.filter((venue) => normalized(venue.label) === normalized(value));
  // These two registered workplace entrances belong to the same fictional club.
  // Do not relax duplicate-label protection for any other venue.
  if (normalized(value) === "after dark" && matches.length === 2 &&
    matches.some((venue) => venue.key === "work:carly") &&
    matches.some((venue) => venue.key === "work:brooke")) return "work:carly";
  const match = matches.length === 1 ? matches[0] : undefined;
  return match?.key ?? value;
}