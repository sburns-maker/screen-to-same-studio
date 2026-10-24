import type { Json } from "@/integrations/supabase/types";
import { venueFromText } from "./place-registry";
export type CalendarEvidence = {
  id: string;
  conversation_id: string;
  sender: string;
  body: string;
  created_at: string;
  character_key: string;
  metadata?: Json;
};
export type CalendarPlan = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  organizer: string;
  origin: string;
  place_key: string | null;
  title: string;
  category: string;
  date_local: string | null;
  time_local: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  version: number;
  user_response: string;
  character_response: string;
  missing_details: string[];
  conflicts: string[];
  followthrough: Json;
  source_message_id: string | null;
  last_message_id: string | null;
  duration_minutes: number;
  user_attendance: string;
  created_at: string;
};
export type CalendarPatch = {
  action: "invite" | "accept" | "decline" | "cancel" | "details" | "reschedule" | "none";
  planId: string | null;
  title?: string;
  category?: string;
  date?: string;
  time?: string;
  place?: string;
  followthrough?: string;
  reason?: string;
};
export function easternDate(at: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
function addDays(date: string, n: number) {
  return new Date(Date.parse(date + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}
export function resolveDate(text: string, at: Date) {
  const s = text.toLowerCase(),
    explicit = /\b(20\d\d-\d\d-\d\d)\b/.exec(s)?.[1];
  if (explicit) {
    try {
      if (addDays(explicit, 0) === explicit) return explicit;
    } catch {
      /* Invalid dates stay unresolved. */
    }
  }
  const month =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i.exec(
      s,
    );
  if (month) {
    const y = month[3] ?? easternDate(at).slice(0, 4);
    const m =
      [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
      ].indexOf(month[1]!) + 1;
    const d = `${y}-${String(m).padStart(2, "0")}-${month[2]!.padStart(2, "0")}`;
    if (!Number.isNaN(Date.parse(d + "T12:00:00Z")) && addDays(d, 0) === d) return d;
  }
  const today = easternDate(at);
  if (/\btomorrow\b/.test(s)) return addDays(today, 1);
  if (/\b(?:today|tonight)\b/.test(s)) return today;
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const day = days.findIndex((d) => new RegExp(`\\b${d}\\b`).test(s));
  if (day < 0) return undefined;
  const current = new Date(today + "T12:00:00Z").getUTCDay();
  let delta = (day - current + 7) % 7;
  if (/\bnext\b/.test(s) && delta === 0) delta = 7;
  return addDays(today, delta);
}
export function resolveTime(text: string, knownEveningPlan = false) {
  const m = /\b(1[0-2]|[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(text);
  if (m) {
    const h = (Number(m[1]) % 12) + (/^p/i.test(m[3]!) ? 12 : 0);
    return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
  }
  const h = /\b(?:at\s+)?(1[3-9]|2[0-3]):([0-5]\d)\b/.exec(text);
  if (h) return `${h[1]}:${h[2]}`;
  // A conversation about dinner tonight often says "8:15" or "815" without PM.
  // Only infer evening when the evidence itself explicitly provides that context.
  const evening = knownEveningPlan || /\b(?:tonight|this evening|dinner|supper)\b/i.test(text);
  const short = /\b(?:at|around|by|for|to|until|moved?\s+(?:it\s+)?to|(?:time\s+is))\s+(1[0-2]|[1-9])(?::([0-5]\d))?\b/i.exec(text);
  if (evening && short) {
    const hour = Number(short[1]) % 12 + 12;
    return `${String(hour).padStart(2, "0")}:${short[2] ?? "00"}`;
  }
  const compact = /\b(?:at|around|by|for|to|until|moved?\s+(?:it\s+)?to)\s+(1[0-2]|[1-9])([0-5]\d)\b/i.exec(text);
  if (evening && compact) {
    const hour = Number(compact[1]) % 12 + 12;
    return `${String(hour).padStart(2, "0")}:${compact[2]}`;
  }
  return undefined;
}
/** Both offset candidates must be checked: ambiguous/nonexistent DST wall time stays unresolved. */
export function easternInstant(date: string | null, time: string | null) {
  if (!date || !time) return null;
  const utc = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(utc)) return null;
  const candidates = [4, 5]
    .map((h) => new Date(utc + h * 3600000))
    .filter(
      (d) =>
        easternDate(d) === date &&
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "America/New_York",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(d) === time,
    );
  return candidates.length === 1 ? candidates[0]!.toISOString() : null;
}
function category(text: string) {
  return /book\s*club/i.test(text)
    ? "book_club"
    : /\b(?:dinner|restaurant)\b/i.test(text)
      ? "dinner"
      : /\bcoffee\b/i.test(text)
        ? "coffee"
        : /\bwalk\b/i.test(text)
          ? "walk"
          : /\b(?:meet|meetup|join|hang out|get together|trivia|gathering)\b/i.test(text)
            ? "meetup"
            : null;
}
export function recognizePlan(
  message: CalendarEvidence,
  plans: CalendarPlan[],
  previousId: string | null,
): CalendarPatch {
  const text = message.body.trim(),
    cat = category(text),
    places = venueFromText(text),
    date = resolveDate(text, new Date(message.created_at)),
    time = resolveTime(text);
  const open = plans.filter(
    (p) =>
      p.conversation_id === message.conversation_id &&
      !["completed", "missed", "cancelled", "declined"].includes(p.status),
  );
  const matching = cat ? open.filter((p) => p.category === cat) : [];
  const adjacent = open.filter((p) => (p.last_message_id ?? p.source_message_id) === previousId);
  const explicitId = (message.metadata as { calendar_plan?: string } | null)?.calendar_plan;
  const explicitTarget = explicitId ? open.find((p) => p.id === explicitId) : undefined;
  const target =
    explicitTarget ??
    (matching.length === 1
      ? matching[0]
      : adjacent.length === 1
        ? adjacent[0]
        : open.length === 1 &&
            (date ||
              time ||
              places.length ||
              /\b(?:address|meet me there|send.*time|venue|pick you up|confirm|what time|where)\b/i.test(
                text,
              ))
          ? open[0]
          : undefined);
  const inviting =
    !!cat &&
    /\b(?:want to|would you like|come (?:along|with|to)|join me|let['’]s|shall we|can we|how about|would you|invite you|meet me)\b/i.test(
      text,
    ) &&
    !/\b(?:don't|do not|cannot|can't|not interested|maybe someday|used to)\b/i.test(text);
  const patch: CalendarPatch = {
    action: "none",
    planId: target?.id ?? null,
    ...(date ? { date } : {}),
    ...(time ? { time } : {}),
    ...(places.length === 1 ? { place: places[0]!.key } : {}),
  };
  if (!time && target?.category === "dinner") {
    const clarified = resolveTime(text, true);
    if (clarified) patch.time = clarified;
  }
  if (
    target &&
    /\b(?:cancel|call (?:it|this) off|not going|can't make it|cannot make it)\b/i.test(text)
  )
    return { ...patch, action: "cancel" };
  if (target && /^(?:no\b|no thanks|i(?:'d| would) rather not|i(?:'ll| will) pass)/i.test(text))
    return { ...patch, action: "decline" };
  if (
    target &&
    /\b(?:reschedule|move (?:it|our|the)|instead|another day)\b/i.test(text) &&
    (date || patch.time || places.length)
  )
    return { ...patch, action: "reschedule" };
  const positive =
    /^(?:yes\b|yeah\b|yep\b|absolutely\b|sounds good\b|that works\b|i['’]d love to\b|count me in\b|sure\b|i['’]m in\b)/i.test(
      text,
    ) && !/\b(?:but not|can't|cannot|don't|if|maybe|might)\b/i.test(text);
  if (
    target &&
    (positive ||
      (message.sender === "tess" &&
        /\b(?:works for me|see you there|we['’]re on|it['’]s a date)\b/i.test(text) &&
        !/\b(?:not|can't|cannot|if|maybe)\b/i.test(text)))
  )
    return { ...patch, action: "accept" };
  if (
    target &&
    (!cat || cat === "meetup") &&
    /\b(?:meet (?:me|you) there|send.*address|send.*time|confirm.*host)\b/i.test(text)
  )
    return {
      ...patch,
      action: "details",
      followthrough: /address/i.test(text)
        ? "venue_details"
        : /host/i.test(text)
          ? "host_unavailable"
          : "meeting_details",
    };
  if (inviting) {
    if (target && target.category === cat && target.status !== "accepted")
      return { ...patch, action: "details" };
    return {
      ...patch,
      action: "invite",
      planId: null,
      category: cat!,
      title:
        cat === "book_club"
          ? "Book club"
          : cat === "dinner"
            ? "Dinner"
            : cat === "coffee"
              ? "Coffee together"
              : cat === "walk"
                ? "A walk"
                : /\btrivia\b/i.test(text)
                  ? "Trivia night"
                  : "Meetup",
    };
  }
  if (
    target &&
    (date ||
      time ||
      places.length === 1 ||
      /\b(?:send (?:you )?the address|send (?:you )?the time|confirm with the host|meet me there|meet you there)\b/i.test(
        text,
      ))
  )
    return {
      ...patch,
      action: "details",
      ...(/\b(?:send.*address|send.*time|confirm.*host|meet.*there)\b/i.test(text)
        ? {
            followthrough: /address/i.test(text)
              ? "venue_details"
              : /host/i.test(text)
                ? "host_unavailable"
                : "meeting_details",
          }
        : {}),
    };
  return { action: "none", planId: null };
}
