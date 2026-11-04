/** Clip to at most `max` UTF-16 units without splitting an emoji (a lone surrogate makes stored JSON invalid). */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text.toWellFormed();
  let out = text.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out.toWellFormed();
}

/** Replace any lone surrogate in every string of a JSON-like value so the database accepts it. */
export function wellFormedJson<T>(value: T): T {
  if (typeof value === "string") return value.toWellFormed() as T;
  if (Array.isArray(value)) return value.map((v) => wellFormedJson(v)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k.toWellFormed(), wellFormedJson(v)])) as T;
  }
  return value;
}
