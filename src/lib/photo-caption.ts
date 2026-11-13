/** Keep saved text intact, but never present an undelivered photo's caption. */
export function photoCaptionVisible(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return true;
  const m = metadata as Record<string, unknown>;
  return !m["photo_pending"] && !m["photo_failure"];
}