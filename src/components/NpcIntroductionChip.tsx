import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { introductionTargets } from "@/lib/npc-introductions";
import { rememberIntroduction } from "@/lib/town.functions";
import { toast } from "sonner";
export function NpcIntroductionChip({ messageId, text }: { messageId: string; text: string }) {
  const targets = introductionTargets(text),
    call = useServerFn(rememberIntroduction),
    navigate = useNavigate(),
    cache = useQueryClient(),
    [busy, setBusy] = useState(false);
  if (!targets.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((n) => (
        <button
          type="button"
          key={n.key}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await call({ data: { messageId, npc: n.key } });
              await cache.invalidateQueries({ queryKey: ["town"] });
              await navigate({ to: "/place/$placeKey", params: { placeKey: r.place } });
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-full border px-3 py-2 text-xs text-primary disabled:opacity-40"
        >
          Meet {n.name}
        </button>
      ))}
    </div>
  );
}
