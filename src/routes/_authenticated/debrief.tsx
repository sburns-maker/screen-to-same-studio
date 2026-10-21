import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { runDebrief } from "@/lib/tess.functions";
import { conversationQuery, debriefsQuery, userTz } from "@/lib/tess-queries";
import { STATE_KEYS } from "@/lib/tess-logic";

export const Route = createFileRoute("/_authenticated/debrief")({
  head: () => ({
    meta: [
      { title: "Debrief — Tess" },
      { name: "description", content: "An honest read on how the conversation is going." },
      { property: "og:title", content: "Debrief — Tess" },
      { property: "og:description", content: "An honest read on how the conversation is going." },
    ],
  }),
  component: DebriefPage,
});

type Analysis = {
  headline: string;
  felt_natural: string[];
  worked: string[];
  didnt_land: string[];
  pressure: string;
  missed_openings: string[];
  tess_read: string;
  who_carried: string;
  tess_invested: string;
  try_next: string;
  stage?: string;
  state?: Record<string, number>;
};

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <section className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((t, i) => (
          <li key={i} className="text-[15px] leading-relaxed">— {t}</li>
        ))}
      </ul>
    </section>
  );
}
function Para({ title, text }: { title: string; text: string }) {
  return (
    <section className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed">{text}</p>
    </section>
  );
}

function DebriefPage() {
  const qc = useQueryClient();
  const conv = useQuery(conversationQuery);
  const list = useQuery(debriefsQuery(conv.data?.id));
  const fn = useServerFn(runDebrief);
  const m = useMutation({
    mutationFn: () => fn({ data: { tz: userTz() } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["debriefs"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Debrief failed"),
  });
  const latest = list.data?.[0];
  const a = latest?.analysis as Analysis | undefined;

  return (
    <>
      <ScreenHeader title="Debrief" />
      <Screen>
        <p className="text-sm text-muted-foreground">An analyst's read on your recent messages. Not Tess — she doesn't see this.</p>
        <Button onClick={() => m.mutate()} disabled={m.isPending} className="mt-4 h-11 w-full rounded-full">
          {m.isPending ? "Reading the conversation…" : latest ? "Run a new debrief" : "Run debrief"}
        </Button>

        {a && (
          <article className="mt-6 rounded-2xl bg-surface p-5">
            <p className="text-xs text-muted-foreground">{new Date(latest!.created_at).toLocaleString()}</p>
            <h2 className="mt-1 font-display text-3xl leading-tight">{a.headline}</h2>
            <Para title="How Tess is reading it" text={a.tess_read} />
            <List title="Felt natural" items={a.felt_natural} />
            <List title="Worked" items={a.worked} />
            <List title="Didn't land" items={a.didnt_land} />
            <Para title="Pressure" text={a.pressure} />
            <List title="Missed openings" items={a.missed_openings} />
            <Para title="Who's carrying it" text={a.who_carried} />
            <Para title="Is she investing?" text={a.tess_invested} />
            <Para title="Try next" text={a.try_next} />
            {conv.data?.show_sim_data && a.state && (
              <section className="mt-6 border-t pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Simulation data · {a.stage}</h3>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
                  {STATE_KEYS.map((k) => (
                    <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span>{a.state![k]}</span></div>
                  ))}
                </div>
              </section>
            )}
          </article>
        )}

        {list.data && list.data.length > 1 && (
          <section className="mt-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Earlier</h3>
            <ul className="mt-2 divide-y rounded-2xl bg-surface">
              {list.data.slice(1).map((d) => (
                <li key={d.id} className="px-4 py-3 text-sm">
                  <div className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</div>
                  {(d.analysis as Analysis).headline}
                </li>
              ))}
            </ul>
          </section>
        )}
      </Screen>
    </>
  );
}
