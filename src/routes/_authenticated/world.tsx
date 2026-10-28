import { TownDirector } from "@/components/TownDirector";
import { SharedWorldProof } from "@/components/SharedWorldProof";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { runWorldTickNow, worldTimeline } from "@/lib/push.functions";

export const Route = createFileRoute("/_authenticated/world")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Living world — Chats" },
      { name: "description", content: "Developer view of the background simulation." },
      { property: "og:title", content: "Living world — Chats" },
      { property: "og:description", content: "Developer view of the background simulation." },
    ],
  }),
  component: WorldPage,
});

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function WorldPage() {
  const qc = useQueryClient();
  const load = useServerFn(worldTimeline);
  const tick = useServerFn(runWorldTickNow);
  const q = useQuery({ queryKey: ["worldTimeline"], queryFn: () => load(), refetchInterval: 30_000 });
  const [running, setRunning] = useState(false);

  const aiPause = (q.data?.control ?? []).find((c) => c.key === "ai_pause")?.value as
    | { paused?: boolean; reason?: string; since?: string }
    | undefined;

  async function runTick() {
    setRunning(true);
    try {
      const r = await tick({});
      toast.success(
        r.skipped
          ? "A tick is already running."
          : `Tick done: ${r.conversationsChecked} checked, ${r.initiated.length} initiated, ${r.pushed} pushed, ${r.aiCalls} AI calls.`,
      );
      qc.invalidateQueries({ queryKey: ["worldTimeline"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tick failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <ScreenHeader title="Living world" backTo="/settings" />
      <Screen>
        {q.data?.developerActions && <><TownDirector /><SharedWorldProof /></>}
        {aiPause?.paused && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <div className="font-medium text-destructive">AI generation is paused</div>
            <p className="mt-1 text-muted-foreground">{aiPause.reason ?? "Credits or policy block."} The world keeps checking and will resume automatically after a successful probe.</p>
          </div>
        )}

        {q.data?.developerActions && <button
          type="button"
          disabled={running}
          onClick={runTick}
          className="mt-4 w-full rounded-2xl bg-primary py-3 text-[15px] font-medium text-primary-foreground disabled:opacity-50"
        >
          {running ? "Running…" : "Run a world tick now"}
        </button>}

        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent events</h3>
        <div className="mt-2 divide-y rounded-2xl bg-surface">
          {(q.data?.events ?? []).length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No world events yet.</p>}
          {(q.data?.events ?? []).map((e) => (
            <div key={e.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px]">{e.summary}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmt(e.occurs_at)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {e.character_key ?? "—"} · {e.kind}
                {e.processed_at ? ` · processed ${fmt(e.processed_at)}` : ""}
              </p>
            </div>
          ))}
        </div>

        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Job history</h3>
        <div className="mt-2 divide-y rounded-2xl bg-surface">
          {(q.data?.jobs ?? []).length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No job runs yet.</p>}
          {(q.data?.jobs ?? []).map((j) => {
            const d = (j.detail ?? {}) as { initiated?: number; pushed?: number; aiCalls?: number; conversationsChecked?: number; errors?: string[]; error?: string };
            return (
              <div key={j.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px]">
                    {j.job} · <span className={j.status === "ok" ? "text-primary" : j.status === "running" ? "text-muted-foreground" : "text-destructive"}>{j.status}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmt(j.started_at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {d.conversationsChecked ?? 0} checked · {d.initiated ?? 0} initiated · {d.pushed ?? 0} pushed · {d.aiCalls ?? 0} AI calls
                  {d.error ? ` · ${d.error}` : ""}
                  {d.errors?.length ? ` · ${d.errors[0]}` : ""}
                </p>
              </div>
            );
          })}
        </div>
        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Social networks</h3>
        <div className="mt-2 divide-y rounded-2xl bg-surface">
          {(q.data?.social.links ?? []).length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No social links yet — run a tick to seed the world.</p>}
          {(["tess", "maya", "claire", "jordan", "ben", "sienna", "kendra"] as const).map((ck) => {
            const charLinks = (q.data?.social.links ?? []).filter((l) => l.character_key === ck);
            if (!charLinks.length) return null;
            return (
              <div key={ck} className="px-4 py-3">
                <div className="text-[15px] font-medium capitalize">{ck}</div>
                <div className="mt-1 space-y-1">
                  {charLinks.map((l) => (
                    <p key={l.id} className="text-xs text-muted-foreground">
                      <span className="text-foreground">{l.other_key}</span> · {l.level}
                      {l.canon ? " · canon" : " · developed"}
                      {l.opinion ? ` — ${l.opinion}` : ""}
                      {l.reason ? ` (${l.reason})` : ""}
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shared events</h3>
        <div className="mt-2 divide-y rounded-2xl bg-surface">
          {(q.data?.social.sharedEvents ?? []).length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No shared events yet.</p>}
          {(q.data?.social.sharedEvents ?? []).map((e) => {
            const parts = (q.data?.social.participants ?? []).filter((p) => p.event_id === e.id);
            return (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px]">{e.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmt(e.occurs_at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {e.kind} · {e.location} · {Object.entries((e.facts ?? {}) as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(", ") || "no facts"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {parts.map((p) => `${p.participant_key}${(p.met as string[]).length ? ` (met: ${(p.met as string[]).join(", ")})` : ""}`).join(" · ") || "no participants"}
                </p>
              </div>
            );
          })}
        </div>

        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Character knowledge</h3>
        <div className="mt-2 divide-y rounded-2xl bg-surface">
          {(q.data?.social.knowledge ?? []).length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">No knowledge entries yet.</p>}
          {(q.data?.social.knowledge ?? []).map((k) => (
            <div key={k.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] capitalize">{k.character_key} <span className="text-xs text-muted-foreground">· {k.knowledge_type}</span></span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmt(k.acquired_at)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{k.summary}{k.source ? ` — ${k.source}` : ""}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">Developer view — only you can see this.</p>
      </Screen>
    </>
  );
}
