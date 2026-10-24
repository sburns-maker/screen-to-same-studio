/** Pure formatting of recorded photo world events for the Mind timeline. Never invents explanations. */
export type PhotoDecisionStatus = "sent" | "generated" | "deferred" | "skipped" | "blocked" | "failed" | "offered";
export type PhotoDecisionDetails = {
  status: PhotoDecisionStatus;
  statusLabel: string;
  reason: string;
  trigger: string | null;
  generationRequested: "yes" | "no" | "not recorded";
  failure: string | null;
  source: string | null;
  legacy: boolean;
};
const LABELS: Record<PhotoDecisionStatus, string> = {
  sent: "Message sent", generated: "Generated", deferred: "Deferred", skipped: "Skipped",
  blocked: "Blocked", failed: "Failed", offered: "Offered to character",
};
export const isPhotoEvent = (kind: string) => kind.startsWith("photo_");
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function photoDecisionDetails(e: { kind: string; summary: string; payload?: unknown }): PhotoDecisionDetails {
  const p = (e.payload && typeof e.payload === "object" ? e.payload : {}) as Record<string, unknown>;
  if (e.kind === "photo_generation_failure") {
    const reason = str(p["reason"]) ?? e.summary;
    return { status: "failed", statusLabel: LABELS.failed, reason: e.summary, trigger: str(p["source"]) ? `${p["source"]} turn` : null,
      generationRequested: "yes", failure: reason, source: str(p["source"]), legacy: false };
  }
  const outcome = str(p["outcome"]);
  let status: PhotoDecisionStatus;
  if (outcome === "message_sent") status = "sent";
  else if (outcome === "not_sent") status = "deferred";
  else if (outcome === "blocked") status = "blocked";
  else if (p["eligible"] === false) status = "blocked";
  else if (p["selected"] === false) status = "skipped";
  else status = "offered";
  const gen = p["generationRequested"];
  return {
    status, statusLabel: LABELS[status],
    reason: str(p["outcomeReason"]) ? `${e.summary} → ${p["outcomeReason"]}` : e.summary,
    trigger: str(p["trigger"]),
    generationRequested: gen === true ? "yes" : gen === false ? "no" : "not recorded",
    failure: status === "blocked" ? (str(p["outcomeReason"]) ?? e.summary) : null,
    source: str(p["source"]),
    legacy: !("trigger" in p),
  };
}
