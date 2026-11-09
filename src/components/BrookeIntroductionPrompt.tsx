import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { brookeIntroductionStatus, respondBrookeIntroduction } from "@/lib/brooke-introduction.functions";

/** Accept/decline controls on Carly's one-time Brooke offer. */
export function BrookeIntroductionPrompt() {
  const load = useServerFn(brookeIntroductionStatus);
  const respond = useServerFn(respondBrookeIntroduction);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["brooke-introduction"], queryFn: () => load() });
  const status = q.data?.status;
  if (!status || status === "not_mentioned") return null;
  if (status === "declined") return <span className="px-2 text-[11px] text-muted-foreground">You passed on this — no worries</span>;
  if (status === "contact_accepted" || status === "met")
    return <span className="px-2 text-[11px] text-muted-foreground">Brooke's number is in your contacts</span>;
  async function answer(accept: boolean) {
    setBusy(true);
    try {
      const r = await respond({ data: { accept } });
      await cache.invalidateQueries({ queryKey: ["brooke-introduction"] });
      await cache.invalidateQueries({ queryKey: ["inbox"] });
      if (r.conversationId) {
        toast.success("Brooke's number was added to your contacts");
        await navigate({ to: "/chat/$conversationId", params: { conversationId: r.conversationId } });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <button type="button" disabled={busy} onClick={() => void answer(true)}
        className="min-h-11 rounded-full border px-4 text-sm text-primary disabled:opacity-40">
        Sure, I'll text Brooke
      </button>
      <button type="button" disabled={busy} onClick={() => void answer(false)}
        className="min-h-11 rounded-full border px-4 text-sm text-muted-foreground disabled:opacity-40">
        Not this time
      </button>
    </div>
  );
}
