import { useEffect, useState } from "react";
import { enableRingtone, startRingtone } from "@/lib/call-ringtone";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { usePhone } from "@/lib/phone-queries";
import { phoneAction } from "@/lib/phone-calls.functions";
import { characterFor } from "@/lib/characters";
import { contactPhoneNumber } from "@/lib/phone-calls";
import { usePortraits } from "@/lib/use-portrait";
export function IncomingCall() {
  const [now, setNow] = useState(Date.now);
  const q = usePhone(),
    act = useServerFn(phoneAction),
    portraits = usePortraits(),
    c = q.data?.calls.find(
      (c) =>
        c.direction === "incoming" &&
        c.state === "ringing" &&
        Date.parse(c.ring_until) > Math.max(now, Date.now()),
    );
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [silencedCall, setSilencedCall] = useState<string | null>(null);
  const [soundRevision, setSoundRevision] = useState(0);
  useEffect(() => {
    const changed = () => setSoundRevision((v) => v + 1);
    window.addEventListener("call-ringtone-change", changed);
    return () => window.removeEventListener("call-ringtone-change", changed);
  }, []);
  const ringingId = c?.id;
  const ringUntil = c?.ring_until;
  useEffect(() => {
    if (!ringUntil) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Date.parse(ringUntil) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [ringUntil]);
  useEffect(() => {
    if (!ringingId || !ringUntil || silencedCall === ringingId) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    setSoundBlocked(false);
    void startRingtone(ringUntil)
      .then((cleanup) => {
        if (disposed) cleanup();
        else stop = cleanup;
      })
      .catch(() => {
        if (!disposed) setSoundBlocked(true);
      });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [ringingId, ringUntil, soundRevision, silencedCall]);
  if (!c || silencedCall === c.id) return null;
  const def = characterFor(c.character_key);
  return (
    <aside
      role="status"
      aria-label="Incoming call"
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-slate-950 via-slate-900 to-slate-700 px-6 pb-16 pt-20 text-center text-white"
    >
      <img
        src={portraits.data?.[def.key] ?? def.avatar}
        alt=""
        className="h-32 w-32 animate-pulse rounded-full object-cover"
      />
      <div className="min-w-0">
        <p className="mt-4 text-3xl font-semibold">{def.preferredName}</p>
        <p className="mt-2 text-sm text-slate-200">
          Incoming call · {contactPhoneNumber(def.key)}
        </p>
        {soundBlocked && (
          <button
            className="min-h-11 text-xs underline"
            onClick={() => void enableRingtone().catch(() => setSoundBlocked(true))}
          >
            Silent ring · tap to enable sound
          </button>
        )}
      </div>
      <div className="flex w-full justify-around gap-6">
      <Link
        onClick={() => setSilencedCall(c.id)}
        to={q.data?.incomingLive ? "/live-call/$conversationId" : "/call/$callId"}
        params={q.data?.incomingLive ? { conversationId: c.conversation_id } : { callId: c.id }}
        search={q.data?.incomingLive ? { incomingCallId: c.id } : {}}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-lg font-medium text-white"
      >
        Answer
      </Link>
      <button
        className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-lg font-medium"
        onClick={() => {
          setSilencedCall(c.id);
          void act({ data: { id: c.id, command: "decline" } })
            .then(() => q.refetch())
            .catch(() => {
              setSilencedCall(null);
              void q.refetch();
            });
        }}
      >
        Decline
      </button>
      </div>
    </aside>
  );
}
