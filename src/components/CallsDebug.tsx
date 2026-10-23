import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { checkVoiceModelAccess } from "@/lib/phone-calls.functions";
import { usePhone } from "@/lib/phone-queries";
import { CALL_LABELS } from "@/lib/phone-calls";
export function CallsDebug({ conversationId }: { conversationId: string }) {
  const check = useServerFn(checkVoiceModelAccess),
    [access, setAccess] = useState("");
  const q = usePhone(),
    c = q.data?.calls.find((c) => c.conversation_id === conversationId);
  return (
    <div className="space-y-2 text-sm">
      <p>
        Calling capability:{" "}
        {q.data?.available
          ? q.data.configured
            ? "configured; live validation still required"
            : "provider setup incomplete"
          : "migration 0023 required"}
      </p>
      <p>Provider: {q.data?.provider ?? "Unavailable"}</p>
      <p>Current / last call: {c ? CALL_LABELS[c.state] : "None"}</p>
      <p>Availability reason: {c?.reason ?? "Not evaluated"}</p>
      <p>Last failure: {c?.last_failure ?? "None recorded"}</p>
      <p>
        Last server audio preparation latency: {c?.last_latency_ms ?? "Not measured"}
        {c?.last_latency_ms ? " ms" : ""}
      </p>
      <p>
        Duration: {c?.duration_seconds ?? 0}s · Attempt reservations: {c?.reserved_cents ?? 0} cents
        (not an exact provider bill)
      </p>
      <p>
        Memory synchronization: only fully acknowledged speech commits through the existing outbox.
        Interrupted speech is discarded.
      </p>
      <button
        className="min-h-11 rounded-full border px-3 text-xs"
        onClick={() =>
          void check()
            .then((r) => setAccess(`Transcription: ${r.transcription}; speech: ${r.speech}`))
            .catch(() => setAccess("Access check unavailable"))
        }
      >
        Check model access (no generation)
      </button>
      {access && <p>{access}</p>}
      <details>
        <summary>Technical call record</summary>
        <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap text-xs">
          {JSON.stringify({ models: q.data?.models, call: c ?? null }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
