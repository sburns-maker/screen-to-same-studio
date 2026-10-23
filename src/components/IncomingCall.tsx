import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { usePhone } from "@/lib/phone-queries";
import { phoneAction } from "@/lib/phone-calls.functions";
import { characterFor } from "@/lib/characters";
import { fictionalNumber } from "@/lib/phone-calls";
import { usePortraits } from "@/lib/use-portrait";
export function IncomingCall() {
  const q = usePhone(),
    act = useServerFn(phoneAction),
    portraits = usePortraits(),
    c = q.data?.calls.find((c) => c.direction === "incoming" && c.state === "ringing");
  if (!c) return null;
  const def = characterFor(c.character_key);
  return (
    <aside
      role="status"
      aria-label="Incoming call"
      className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-3xl border bg-background p-4 shadow-xl"
    >
      <img
        src={portraits.data?.[def.key] ?? def.avatar}
        alt=""
        className="h-12 w-12 animate-pulse rounded-full object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{def.preferredName}</p>
        <p className="text-xs text-muted-foreground">Incoming call · {fictionalNumber(def.key)}</p>
      </div>
      <Link
        to="/call/$callId"
        params={{ callId: c.id }}
        className="rounded-full bg-primary px-3 py-3 text-sm text-primary-foreground"
      >
        Answer
      </Link>
      <button
        className="min-h-11 text-sm"
        onClick={() => void act({ data: { id: c.id, command: "decline" } }).then(() => q.refetch())}
      >
        Decline
      </button>
    </aside>
  );
}
