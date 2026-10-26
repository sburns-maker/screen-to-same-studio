import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { characterFor } from "@/lib/characters";
import { usePortraits } from "@/lib/use-portrait";
import { endLiveCall, liveCallHeartbeat, liveCallStatus, startLiveCall } from "@/lib/live-calls.functions";
import { createLiveCall, type LiveCallState } from "@/lib/live-call-client";
import { LIVE_CALL_HEARTBEAT_MS, type TranscriptLine } from "@/lib/live-calls";

export const Route = createFileRoute("/_authenticated/live-call/$conversationId")({
  validateSearch: (search: Record<string, unknown>) => ({ incomingCallId: typeof search.incomingCallId === "string" && /^[0-9a-f-]{36}$/i.test(search.incomingCallId) ? search.incomingCallId : undefined }),
  head: () => ({
    meta: [
      { title: "Voice call · AI Town" },
      { name: "description", content: "A private live voice call with one of your contacts." },
      { property: "og:title", content: "Voice call · AI Town" },
      { property: "og:description", content: "A private live voice call with one of your contacts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LiveCallScreen,
});

function LiveCallScreen() {
  const { conversationId } = Route.useParams();
  const { incomingCallId } = Route.useSearch();
  const navigate = useNavigate();
  const statusFn = useServerFn(liveCallStatus);
  const startFn = useServerFn(startLiveCall);
  const beatFn = useServerFn(liveCallHeartbeat);
  const endFn = useServerFn(endLiveCall);
  const portraits = usePortraits();
  const status = useQuery({
    queryKey: ["live-call-status", conversationId],
    queryFn: () => statusFn({ data: { conversationId } }),
  });
  const def = characterFor(status.data?.character);
  const audio = useRef<HTMLAudioElement>(null);
  const call = useRef<ReturnType<typeof createLiveCall> | null>(null);
  const callId = useRef<string | null>(null);
  const deadline = useRef<number>(0);
  const finished = useRef(false);
  const [state, setState] = useState<LiveCallState | "idle">("idle");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [now, setNow] = useState(Date.now());
  const [startedAt, setStartedAt] = useState<number | null>(null);

  async function finish() {
    if (finished.current || !callId.current) return;
    finished.current = true;
    const transcript = call.current?.transcript() ?? [];
    try {
      const r = await endFn({ data: { callId: callId.current, transcript, ...(incomingCallId ? { incomingCallId } : {}) } });
      if (r.saved) setNote(`${def.preferredName} will remember this call.`);
    } catch {
      /* the server deadline and scheduled sweep still close it */
    }
  }

  useEffect(() => {
    if (state === "ended") void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (state !== "connected" && state !== "blocked") return;
    const tick = setInterval(() => {
      setNow(Date.now());
      if (deadline.current && Date.now() >= deadline.current) call.current?.hangUp();
    }, 1_000);
    const beat = setInterval(() => {
      if (!callId.current) return;
      void beatFn({ data: { callId: callId.current } })
        .then((r) => r.ended && call.current?.hangUp())
        .catch(() => {});
    }, LIVE_CALL_HEARTBEAT_MS);
    return () => {
      clearInterval(tick);
      clearInterval(beat);
    };
  }, [state, beatFn]);

  useEffect(
    () => () => {
      call.current?.hangUp();
      call.current?.release();
    },
    [],
  );

  function dial() {
    if (!audio.current || call.current) return;
    setError("");
    setNote("");
    finished.current = false;
    const c = createLiveCall({
      audio: audio.current,
      onState: (s) => {
        setState(s);
        if (s === "connected") setStartedAt((t) => t ?? Date.now());
      },
      onError: setError,
      onTranscript: setLines,
      onSpeaking: setSpeaking,
      connect: async (sdp) => {
        const r = await startFn({ data: { conversationId, sdp, ...(incomingCallId ? { incomingCallId } : {}) } });
        if (!r.answered) {
          setNote(r.reason);
          return null;
        }
        callId.current = r.callId;
        deadline.current = Date.parse(r.deadlineAt);
        return { sdp: r.sdp };
      },
    });
    call.current = c;
    void c.start();
  }

  const active = state === "dialing" || state === "connected" || state === "blocked";
  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const left = deadline.current ? Math.max(0, Math.ceil((deadline.current - now) / 1000)) : 0;
  const unavailable = status.data && (!status.data.enabled || !status.data.voiceSet);

  return (
    <main className="flex min-h-dvh flex-col items-center px-6 pb-28 pt-10 text-center">
      <audio ref={audio} autoPlay playsInline />
      <img
        src={portraits.data?.[def.key] ?? def.avatar}
        alt={def.preferredName}
        className={`h-32 w-32 rounded-full object-cover ${speaking ? "ring-4 ring-primary" : ""}`}
      />
      <h1 className="mt-4 text-2xl font-semibold">{def.preferredName}</h1>
      <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
        {state === "dialing"
          ? "Calling…"
          : state === "connected"
            ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}${left <= 60 ? ` · ${left}s left` : ""}`
            : state === "blocked"
              ? "Tap to hear audio"
              : state === "ending"
                ? "Hanging up…"
                : state === "ended"
                  ? "Call ended"
                  : status.data
                    ? `Calls last up to ${Math.round(status.data.maxSeconds / 60)} minutes`
                    : ""}
      </p>
      {unavailable && (
        <p className="mt-4 max-w-sm text-sm">
          {!status.data.enabled
            ? "Calling is turned off right now."
            : `${def.preferredName} doesn't have a phone voice yet.`}
        </p>
      )}
      {status.error && <p className="mt-4 text-sm">{(status.error as Error).message}</p>}
      {error && (
        <p role="alert" className="mt-4 max-w-sm text-sm">
          {error}
        </p>
      )}
      {note && <p className="mt-4 max-w-sm text-sm text-muted-foreground">{note}</p>}

      <div className="mt-8 flex justify-center gap-5">
        {!active && state !== "ending" && (
          <button
            aria-label={`${incomingCallId ? "Answer" : "Call"} ${def.preferredName}`}
            disabled={!status.data || !!unavailable}
            onClick={() => {
              call.current = null;
              callId.current = null;
              deadline.current = 0;
              setStartedAt(null);
              setLines([]);
              dial();
            }}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            <Phone />
          </button>
        )}
        {state === "blocked" && (
          <button onClick={() => void call.current?.resume()} className="min-h-14 rounded-full border px-5 text-sm">
            Play audio
          </button>
        )}
        {(state === "connected" || state === "blocked") && (
          <button
            aria-label={muted ? "Unmute microphone" : "Mute microphone"}
            onClick={() => {
              const m = !muted;
              setMuted(m);
              call.current?.setMuted(m);
            }}
            className="flex h-14 w-14 items-center justify-center rounded-full border"
          >
            {muted ? <MicOff /> : <Mic />}
          </button>
        )}
        {active && (
          <button
            aria-label="Hang up"
            onClick={() => call.current?.hangUp()}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
          >
            <PhoneOff />
          </button>
        )}
      </div>

      {lines.length > 0 && (
        <section className="mt-8 w-full max-w-md space-y-2 text-left text-sm" aria-label="Live captions">
          {lines.slice(-6).map((l, i) => (
            <p key={i} className={l.role === "user" ? "text-muted-foreground" : ""}>
              <span className="font-medium">{l.role === "user" ? "You" : def.preferredName}: </span>
              {l.text}
            </p>
          ))}
        </section>
      )}

      <div className="mt-10 flex gap-4 text-sm">
        <Link to="/chat/$conversationId" params={{ conversationId }} className="underline">
          Back to messages
        </Link>
        {state === "ended" && (
          <button className="underline" onClick={() => void navigate({ to: "/calls" })}>
            Calls
          </button>
        )}
      </div>
    </main>
  );
}
