import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { conversationQuery, memoriesQuery, stateQuery } from "@/lib/tess-queries";
import { STATE_KEYS, deriveStage, type TessState } from "@/lib/tess-logic";

export const Route = createFileRoute("/_authenticated/debug")({
  head: () => ({
    meta: [
      { title: "Simulation debug — Tess" },
      { name: "description", content: "Hidden simulation values for Tess." },
      { property: "og:title", content: "Simulation debug — Tess" },
      { property: "og:description", content: "Hidden simulation values for Tess." },
    ],
  }),
  component: Debug,
});

function Debug() {
  const conv = useQuery(conversationQuery);
  const st = useQuery({ ...stateQuery(conv.data?.id), refetchInterval: 4000 });
  const mem = useQuery(memoriesQuery(conv.data?.id));
  const s = st.data as unknown as (TessState & { last_delta: Record<string, unknown>; last_tone: string | null }) | null;

  return (
    <>
      <ScreenHeader title="Simulation debug" />
      <Screen>
        {s && (
          <>
            <div className="rounded-2xl bg-surface p-4">
              <div className="text-xs text-muted-foreground">Stage</div>
              <div className="font-display text-2xl">{deriveStage(s)}</div>
              <div className="mt-1 text-xs text-muted-foreground">Last tone: {s.last_tone ?? "—"} · Difficulty: {conv.data?.difficulty}</div>
              {Array.isArray(s.last_delta?.['tags']) && (s.last_delta['tags'] as string[]).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(s.last_delta['tags'] as string[]).map((t) => (
                    <span key={t} className="rounded-full bg-accent px-2 py-0.5 font-mono text-[11px] text-accent-foreground">{t}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 space-y-2.5 rounded-2xl bg-surface p-4">
              {STATE_KEYS.map((k) => {
                const d = Number(s.last_delta?.[k] ?? 0);
                return (
                  <div key={k}>
                    <div className="flex justify-between font-mono text-xs">
                      <span className="text-muted-foreground">{k}</span>
                      <span>
                        {s[k]} {d !== 0 && <span className={d > 0 ? "text-primary" : "text-destructive"}>({d > 0 ? "+" : ""}{d})</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${s[k]}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Relationship memories</h3>
        <ul className="mt-2 divide-y rounded-2xl bg-surface">
          {(mem.data ?? []).length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Nothing meaningful saved yet.</li>}
          {(mem.data ?? []).map((m) => (
            <li key={m.id} className="px-4 py-3 text-sm">
              <span className="font-mono text-[11px] text-muted-foreground">{m.memory_type} · {m.importance}</span>
              <div>{m.summary}</div>
            </li>
          ))}
        </ul>
      </Screen>
    </>
  );
}
