import { Phone } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { phoneAction } from "@/lib/phone-calls.functions";
import { useState } from "react";
import { toast } from "sonner";
export function CallButton({ conversationId, name }: { conversationId: string; name: string }) {
  const act = useServerFn(phoneAction),
    navigate = useNavigate(),
    [busy, setBusy] = useState(false);
  return (
    <button
      aria-label={`Call ${name}`}
      disabled={busy}
      className="flex h-11 w-11 items-center justify-center rounded-full border disabled:opacity-50"
      onClick={() => {
        setBusy(true);
        const id = crypto.randomUUID();
        void act({ data: { id, command: "start", conversation: conversationId } })
          .then(() => navigate({ to: "/call/$callId", params: { callId: id } }))
          .catch((e) => {
            toast.message((e as Error).message);
            void navigate({ to: "/calls" });
          })
          .finally(() => setBusy(false));
      }}
    >
      <Phone className="h-5 w-5" />
    </button>
  );
}
