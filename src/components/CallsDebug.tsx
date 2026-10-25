import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  checkVoiceModelAccess,
  diagnoseIncomingCalls,
  testIncomingRing,
} from "@/lib/phone-calls.functions";
import { usePhone } from "@/lib/phone-queries";
import { CALL_LABELS } from "@/lib/phone-calls";
export function CallsDebug({ conversationId }: { conversationId: string }) {
  const check = useServerFn(checkVoiceModelAccess),
    diagnose = useServerFn(diagnoseIncomingCalls),
    testRing = useServerFn(testIncomingRing),
    [diagnosis, setDiagnosis] = useState<Awaited<ReturnType<typeof diagnose>> | null>(null),
    [callTest, setCallTest] = useState(""),
    [access, setAccess] = useState("");
  const [ringBusy, setRingBusy] = useState(false);
  const ringId = useRef<string | null>(null);
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
      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer font-medium">
          Incoming call diagnostics and test ring
        </summary>
        <p className="my-2 text-xs">
          Read-only diagnostics show current blockers, each contact's availability, Real-Time mode
          and the stable hourly selection. This does not prove the worker has run.
        </p>
        <button
          className="min-h-11 rounded-full border px-3 text-xs"
          onClick={() =>
            void diagnose()
              .then(setDiagnosis)
              .catch((e) => setCallTest((e as Error).message))
          }
        >
          Refresh call eligibility (no AI cost)
        </button>
        {diagnosis && (
          <div className="my-3 space-y-2 text-xs">
            <p>Checked: {new Date(diagnosis.checkedAt).toLocaleString()}</p>
            <p>
              Global blockers:{" "}
              {diagnosis.globalBlocks.length ? diagnosis.globalBlocks.join("; ") : "None detected"}
            </p>
            {diagnosis.characters.map((c) => (
              <div key={c.conversationId} className="rounded-lg border p-2">
                <p className="font-semibold">
                  {c.character}: {c.availability} · {c.activity}
                </p>
                <p>
                  Real-Time: {String(c.realTime)} · Muted: {String(c.muted)} · Occupied:{" "}
                  {String(c.occupied)} · 6-hour cooldown: {String(c.cooldown)}
                </p>
                <p>Blockers: {c.blockers.length ? c.blockers.join("; ") : "None at this step"}</p>
                <p>
                  Hourly selection: {String(c.selectedThisHour)} (threshold{" "}
                  {(c.chanceThisHour * 100).toFixed(1)}%)
                </p>
              </div>
            ))}
            <p>{diagnosis.note}</p>
            <button
              disabled={ringBusy}
              className="min-h-11 rounded-full border px-3 text-xs disabled:opacity-50"
              onClick={() => {
                if (
                  ringBusy ||
                  !window.confirm(
                    "Create one developer test ring? Declining is free; answering may start paid voice processing.",
                  )
                )
                  return;
                setRingBusy(true);
                setCallTest("");
                ringId.current ??= crypto.randomUUID();
                void testRing({ data: { conversationId, id: ringId.current } })
                  .then((r) => {
                    setCallTest(r.note);
                    ringId.current = null;
                    void q.refetch();
                  })
                  .catch((e) => setCallTest((e as Error).message))
                  .finally(() => setRingBusy(false));
              }}
            >
              Trigger one test incoming ring for this character
            </button>
            <p>
              Test ringing creates an incoming call record. Do not answer unless you want to test a
              potentially billable voice session. Decline or let it expire instead.
            </p>
          </div>
        )}
        {callTest && (
          <p role="status" className="my-2 text-xs">
            {callTest}
          </p>
        )}
      </details>
      <details>
        <summary>Technical call record</summary>
        <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap text-xs">
          {JSON.stringify({ models: q.data?.models, call: c ?? null }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
