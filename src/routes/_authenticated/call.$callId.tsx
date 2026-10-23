import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PhoneOff, Mic, MicOff, Volume2, Phone } from "lucide-react";
import { usePhone } from "@/lib/phone-queries";
import { phoneAction, phoneSpeech } from "@/lib/phone-calls.functions";
import { characterFor } from "@/lib/characters";
import { fictionalNumber, CALL_LABELS, ACTIVE_CALL_STATES, callDuration } from "@/lib/phone-calls";
import { usePortraits } from "@/lib/use-portrait";
import { PhoneAudio } from "@/lib/phone-browser";
export const Route = createFileRoute("/_authenticated/call/$callId")({ component: CallScreen });
function CallScreen() {
  const { callId } = Route.useParams(),
    q = usePhone(),
    act = useServerFn(phoneAction),
    speech = useServerFn(phoneSpeech),
    portraits = usePortraits();
  const c = q.data?.calls.find((c) => c.id === callId),
    def = characterFor(c?.character_key);
  const audio = useRef<PhoneAudio | null>(null),
    turn = useRef<string | null>(null),
    alive = useRef(true),
    started = useRef(false),
    [phase, setPhase] = useState(""),
    [error, setError] = useState(""),
    [muted, setMuted] = useState(false),
    [now, setNow] = useState(Date.now());
  const end = useCallback(
    async (failed = false) => {
      alive.current = false;
      audio.current?.close();
      audio.current = null;
      setPhase("");
      await act({ data: { id: callId, command: failed ? "fail" : "end" } }).catch(() => {});
      await q.refetch();
    },
    [act, callId, q],
  );
  const request = async (clip: string | null) => {
    if (!alive.current) return;
    const tid = crypto.randomUUID();
    turn.current = tid;
    setPhase("Thinking…");
    try {
      const r = await speech({ data: { id: callId, turn: tid, audio: clip } });
      if (!alive.current) return;
      setPhase("Speaking");
      await audio.current!.play(r.base64, r.mime, () => {
        void act({ data: { id: callId, command: "played", turn: tid } })
          .then(async () => {
            turn.current = null;
            await q.refetch();
            if (r.endCall) {
              await end();
              return;
            }
            listen();
          })
          .catch(() => {
            setError("The reply could not be confirmed. Please reconnect.");
            void end(true);
          });
      });
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message);
        void end(true);
      }
    }
  };
  const listen = () => {
    if (!alive.current || !audio.current || audio.current.muted) return;
    setPhase("Listening");
    try {
      audio.current.record(
        (clip) => void request(clip),
        () => {
          if (alive.current) setPhase("Ready when you are");
        },
      );
    } catch {
      setError("Microphone unavailable");
      void end(true);
    }
  };
  async function connect() {
    if (started.current) return;
    started.current = true;
    alive.current = true;
    try {
      if (c?.state === "ringing") {
        const answer = (await act({ data: { id: callId, command: "answer" } })) as {
          state?: string;
        };
        if (answer.state !== "connecting") throw new Error("Call is no longer available");
      }
      const controller = new PhoneAudio();
      audio.current = controller;
      setPhase("Connecting");
      await controller.open();
      const connected = (await act({ data: { id: callId, command: "connect" } })) as {
        state?: string;
      };
      if (connected.state !== "connected") throw new Error("Call is no longer available");
      await q.refetch();
      await request(null);
    } catch {
      setError("Microphone permission or voice connection unavailable.");
      await end(true);
    }
  }
  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const unload = () => audio.current?.close();
    window.addEventListener("pagehide", unload);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("pagehide", unload);
      audio.current?.close();
      if (started.current) void act({ data: { id: callId, command: "end" } }).catch(() => {});
    };
  }, [act, callId]);
  useEffect(() => {
    if (c?.state === "connected" && !started.current) {
      setError("The call connection was interrupted. Start a new call from Recents.");
      void act({ data: { id: callId, command: "fail" } }).then(() => q.refetch());
      return;
    }
    if (c?.state === "calling" && now >= Date.parse(c.ring_until))
      void act({ data: { id: callId, command: "resolve" } }).then(() => q.refetch());
    if (c && (!ACTIVE_CALL_STATES.includes(c.state) || now >= Date.parse(c.expires_at))) {
      audio.current?.close();
      alive.current = false;
    }
  }, [c, now, act, callId, q]);
  async function interrupt() {
    audio.current?.stopPlayback();
    try {
      if (turn.current) {
        await act({ data: { id: callId, command: "interrupt", turn: turn.current } });
        turn.current = null;
      }
      listen();
    } catch {
      setError("Connection interrupted");
      await end(true);
    }
  }
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-10 text-center">
      <Link to="/calls" className="mb-8 min-h-11 py-3 text-sm underline">
        Recents
      </Link>
      {q.isLoading ? (
        <p role="status">Opening call…</p>
      ) : !c ? (
        <p role="alert">Call unavailable. Open Recents to check its status.</p>
      ) : (
        <>
          <img
            src={portraits.data?.[def.key] ?? def.avatar}
            alt={def.preferredName}
            className={`h-36 w-36 rounded-full object-cover shadow-lg ${["calling", "ringing"].includes(c.state) ? "animate-pulse" : ""}`}
          />
          <h1 className="mt-6 font-display text-4xl">{def.preferredName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{fictionalNumber(def.key)}</p>
          <p role="status" className="mt-4 text-lg">
            {CALL_LABELS[c.state] ?? c.state}
          </p>
          {c.state === "connected" && (
            <>
              <p className="mt-2 tabular-nums">
                {Math.floor(callDuration(c, new Date(now)) / 60)}:
                {String(callDuration(c, new Date(now)) % 60).padStart(2, "0")}
              </p>
              <p className="mt-3 h-6 text-sm text-muted-foreground">{phase}</p>
            </>
          )}
          {error && (
            <p role="alert" className="mt-4 max-w-sm text-sm">
              {error}
            </p>
          )}
          <div className="mt-10 flex flex-wrap justify-center gap-5">
            {["ringing", "connecting"].includes(c.state) && (
              <button
                aria-label={c.state === "ringing" ? "Answer" : "Connect microphone"}
                onClick={() => void connect()}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground"
              >
                <Phone />
              </button>
            )}
            {c.state === "connected" && (
              <>
                <button
                  aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                  onClick={() => {
                    const v = !muted;
                    setMuted(v);
                    audio.current?.setMuted(v);
                    if (v) setPhase("Microphone muted");
                    if (!v) listen();
                  }}
                  className="flex h-14 w-14 items-center justify-center rounded-full border"
                >
                  {muted ? <MicOff /> : <Mic />}
                </button>
                <button
                  aria-label="Choose audio output"
                  onClick={() =>
                    void audio.current?.chooseOutput().catch((e) => setError((e as Error).message))
                  }
                  className="flex h-14 w-14 items-center justify-center rounded-full border"
                >
                  <Volume2 />
                </button>
                <button
                  disabled={muted || phase === "Thinking…"}
                  onClick={() =>
                    phase === "Listening" ? audio.current?.stopRecording() : void interrupt()
                  }
                  className="min-h-14 rounded-full border px-4 text-sm disabled:opacity-40"
                >
                  {phase === "Listening"
                    ? "Finish speaking"
                    : phase === "Speaking"
                      ? "Interrupt"
                      : "Speak"}
                </button>
              </>
            )}
            {ACTIVE_CALL_STATES.includes(c.state) && (
              <button
                aria-label={c.state === "ringing" ? "Decline call" : "Hang up"}
                onClick={() =>
                  c.state === "ringing"
                    ? void act({ data: { id: callId, command: "decline" } }).then(() => q.refetch())
                    : void end()
                }
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white"
              >
                <PhoneOff />
              </button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
