import { invalidateSchedule } from "@/lib/use-schedule";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import {
  experienceAction,
  experienceMoments,
  recoverExperienceOperation,
} from "@/lib/living-experiences.functions";
import { useExperiences } from "@/lib/use-experiences";
import { characterFor } from "@/lib/characters";
import { placeByKey } from "@/lib/place-registry";
import { usePortraits } from "@/lib/use-portrait";
import { canTransition } from "@/lib/experience-lifecycle";
import type { ExperienceRow } from "@/lib/living-experiences";
export const Route = createFileRoute("/_authenticated/experiences")({
  head: () => ({
    meta: [
      { title: "Living Experiences \u00b7 AI Town" },
      { name: "description", content: "Your scheduled and recorded fictional outings in AI Town." },
      { property: "og:title", content: "Living Experiences \u00b7 AI Town" },
      {
        property: "og:description",
        content: "Your scheduled and recorded fictional outings in AI Town.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    plan: typeof s["plan"] === "string" ? s["plan"] : "",
  }),
  component: Experiences,
});
function ready(e: ExperienceRow) {
  return canTransition(
    {
      id: e.id,
      planId: e.plan_id,
      state: e.state as Parameters<typeof canTransition>[0]["state"],
      startAt: e.start_at,
      claimDeadline: e.claim_deadline,
      claimedAt: e.claimed_at,
      mode: e.mode as Parameters<typeof canTransition>[0]["mode"],
      outcomeId: e.outcome_id,
      revision: e.revision,
    },
    "claim",
    new Date(),
  );
}
const local = (s: string) =>
  new Date(s).toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
function Experiences() {
  const portraits = usePortraits();
  const selected = Route.useSearch().plan;
  const q = useExperiences(),
    cache = useQueryClient(),
    action = useServerFn(experienceAction),
    recover = useServerFn(recoverExperienceOperation),
    read = useServerFn(experienceMoments);
  const [active, setActive] = useState(selected),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ids = useRef(new Map<string, string>()),
    bottom = useRef<HTMLDivElement>(null);
  const history = useQuery({
    queryKey: ["experience-history", active],
    queryFn: () => read({ data: { planId: active } }),
    enabled: !!active && !!q.data?.scenes.some((e) => e.plan_id === active),
    refetchInterval: 5000,
    retry: false,
  });
  useEffect(() => {
    setActive(selected);
  }, [selected]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [history.data?.moments.length]);
  const scene = q.data?.scenes.find((e) => e.plan_id === active),
    plan = q.data?.plans.find((p) => p.id === active),
    person = characterFor(plan?.organizer);
  async function act(
    e: ExperienceRow,
    command: "claim" | "pause" | "resume" | "turn" | "finish" | "automatic" | "window",
    body = "",
    retryId?: string,
  ) {
    if (
      (command === "finish" || command === "automatic") &&
      !window.confirm(
        command === "finish"
          ? body === "close_now"
            ? "Finish here and save only the recorded experience?"
            : "Finish only the remaining portion automatically? Recorded choices will be preserved."
          : "Simulate this outing off-screen? No user dialogue or new intimate milestone will be invented.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setActive(e.plan_id);
    const key = JSON.stringify([e.plan_id, command, body]);
    const id = retryId ?? ids.current.get(key) ?? crypto.randomUUID();
    ids.current.set(key, id);
    try {
      const result = await action({
        data: {
          planId: e.plan_id,
          id,
          action: command,
          revision: e.revision,
          text: body,
          hours: command === "window" ? Number(body) : 4,
        },
      });
      if (command === "claim") {
        const openingKey = JSON.stringify([e.plan_id, "opening"]);
        const opening = ids.current.get(openingKey) ?? crypto.randomUUID();
        ids.current.set(openingKey, opening);
        await action({
          data: {
            planId: e.plan_id,
            id: opening,
            action: "turn",
            revision: result.experience.revision,
            text: "",
            hours: 4,
          },
        });
        ids.current.delete(openingKey);
      }
      ids.current.delete(key);
      if (command === "turn") setText("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["living-experiences"] }),
        cache.invalidateQueries({ queryKey: ["experience-history"] }),
        invalidateSchedule(cache),
        cache.invalidateQueries({ queryKey: ["debug"] }),
      ]);
      setBusy(false);
    }
  }
  return (
    <>
      <ScreenHeader title={plan ? plan.title : "Living Experiences"} backTo="/plans" />
      <Screen>
        <div className="space-y-4 pb-24">
          <p className="text-sm text-muted-foreground">
            Begin within the start window; the outing begins at its fictional scheduled time.
            Pausing keeps your place across devices.
          </p>
          {(error || q.error || history.error) && (
            <p role="alert" className="rounded-xl border border-destructive p-3">
              {error || (q.error as Error)?.message || (history.error as Error)?.message}
            </p>
          )}
          {q.isLoading ? (
            <p role="status">Loading outings…</p>
          ) : !q.data?.available ? (
            <p>
              Living Experiences require reviewed migrations 0025–0026 and server enablement. Your
              existing plans are preserved.
            </p>
          ) : (
            <>
              {!q.data.scenes.length && (
                <p>
                  No eligible outings yet. Confirm an upcoming plan with a time and venue in
                  Messages.
                </p>
              )}
              {scene && (
                <button
                  onClick={() => setActive("")}
                  className="min-h-11 rounded-full border px-4 text-sm"
                >
                  Other outings
                </button>
              )}
              {scene?.state === "completed" &&
                q.data.plans
                  .filter((p) => p.parent_plan_id === active && p.status === "accepted")
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setActive(p.id)}
                      className="min-h-11 w-full rounded-2xl border bg-surface p-4 text-left"
                    >
                      Continue your outing · {p.title}
                      <span className="block text-xs text-muted-foreground">
                        Your earlier experience is saved. Begin the follow-up when ready.
                      </span>
                    </button>
                  ))}
              {q.data.scenes
                .filter((e) => !scene || e.plan_id === active)
                .map((e) => {
                  const p = q.data.plans.find((x) => x.id === e.plan_id);
                  if (!p) return null;
                  return (
                    <article key={e.id} className="space-y-2 rounded-2xl border bg-surface p-4">
                      <button
                        className="w-full text-left"
                        onClick={() => {
                          setActive(e.plan_id);
                          setError("");
                        }}
                      >
                        <h2 className="font-semibold">{p.title}</h2>
                        <p className="text-sm">
                          {characterFor(p.organizer).preferredName} ·{" "}
                          {placeByKey(p.place_key)?.label ?? p.place_key}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {local(e.start_at)} Eastern · start by {local(e.claim_deadline)}
                        </p>
                      </button>
                      <p className="text-xs" role="status">
                        {e.state.replace("_", " ")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {e.state === "scheduled" && (
                          <label className="text-xs">
                            Start window (hours)
                            <select
                              aria-label={`Start window for ${p.title}`}
                              value={Math.round(
                                (Date.parse(e.claim_deadline) -
                                  Math.max(
                                    Date.parse(e.start_at),
                                    Date.parse(
                                      q.data.scenes.find(
                                        (parent) =>
                                          parent.plan_id === p.parent_plan_id &&
                                          parent.state === "completed",
                                      )?.updated_at ?? e.start_at,
                                    ),
                                  )) /
                                  3600000,
                              )}
                              disabled={busy}
                              onChange={(ev) => void act(e, "window", ev.target.value)}
                              className="ml-2 min-h-11 rounded-xl border bg-background px-2"
                            >
                              {[1, 2, 4, 6, 8, 12, 24].map((h) => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {(ready(e) || (e.state === "scheduled" && p.followupReady)) && (
                          <button
                            disabled={busy}
                            onClick={() => void act(e, "claim")}
                            className="min-h-11 rounded-full bg-primary px-4 text-primary-foreground"
                          >
                            Experience this outing
                          </button>
                        )}
                        {e.state === "scheduled" && Date.now() >= Date.parse(e.start_at) && (
                          <button
                            disabled={busy}
                            onClick={() => void act(e, "automatic")}
                            className="min-h-11 rounded-full border px-4"
                          >
                            Skip &amp; Simulate
                          </button>
                        )}
                        {e.state === "paused" && (
                          <button
                            disabled={busy}
                            onClick={() => void act(e, "resume")}
                            className="min-h-11 rounded-full border px-4"
                          >
                            Resume Experience
                          </button>
                        )}
                        {e.state === "auto_running" && (
                          <button
                            disabled={busy}
                            onClick={() => void act(e, "automatic")}
                            className="min-h-11 rounded-full border px-4"
                          >
                            Retry automatic completion
                          </button>
                        )}
                      </div>
                      {e.last_failure && (
                        <p className="text-sm text-destructive">{e.last_failure}</p>
                      )}
                    </article>
                  );
                })}
              {scene && plan && (
                <section
                  aria-label="In-person experience"
                  className="space-y-4 rounded-2xl border p-4"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={portraits.data?.[person.key] ?? person.avatar}
                      alt={person.preferredName}
                      className="h-14 w-14 rounded-full object-cover"
                    />
                    <div>
                      <h2 className="font-semibold">With {person.preferredName}</h2>
                      <p className="text-xs">
                        {plan.title} · {placeByKey(plan.place_key)?.label ?? "Venue"}
                      </p>
                    </div>
                  </div>
                  <div aria-live="polite" className="max-h-[55dvh] space-y-3 overflow-y-auto">
                    {history.isLoading ? (
                      <p>Loading scene…</p>
                    ) : (
                      history.data?.moments.map((m) => (
                        <div
                          key={m.id}
                          className={`whitespace-pre-wrap rounded-2xl p-3 text-sm leading-relaxed ${m.source === "user" ? "ml-6 bg-primary/10" : "mr-3 bg-surface"}`}
                        >
                          <span className="mb-1 block text-xs text-muted-foreground">
                            {m.source === "user"
                              ? "You"
                              : m.source === "simulation"
                                ? "Closing moments"
                                : person.preferredName}
                          </span>
                          {m.body}
                        </div>
                      ))
                    )}
                    <div ref={bottom} />
                  </div>
                  {history.data?.pending && (
                    <div role="status" className="rounded-xl border p-3 text-sm">
                      <p>
                        Pending scene: {history.data.pending.status}. Recorded progress is
                        preserved.
                      </p>
                      <button
                        disabled={busy}
                        onClick={() => {
                          const o = history.data!.pending!;
                          void act(scene, o.kind as "turn" | "finish" | "automatic", o.body, o.id);
                        }}
                        className="min-h-11 rounded-full border px-4"
                      >
                        Retry pending scene
                      </button>
                      {history.data.pending.status === "failed" &&
                        history.data.pending.attempts >= 3 && (
                          <button
                            disabled={busy}
                            className="ml-2 min-h-11 rounded-full border px-4"
                            onClick={async () => {
                              setBusy(true);
                              setError("");
                              try {
                                await recover({
                                  data: {
                                    planId: scene.plan_id,
                                    operationId: history.data!.pending!.id,
                                  },
                                });
                                await history.refetch();
                                setError(
                                  "Retry allowance restored for this scene. Tap Retry pending scene to continue from your saved progress.",
                                );
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Recovery failed");
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Recover exhausted scene
                          </button>
                        )}
                    </div>
                  )}
                  {scene.state === "interactive" && !history.data?.pending && (
                    <>
                      {!history.data?.moments.some((m) => m.source === "character") &&
                        !history.isLoading && (
                          <button
                            disabled={busy}
                            onClick={() => void act(scene, "turn")}
                            className="min-h-11 rounded-full border px-4"
                          >
                            Begin scene / retry opening
                          </button>
                        )}
                      <form
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          if (text.trim()) void act(scene, "turn", text.trim());
                        }}
                        className="space-y-2"
                      >
                        <textarea
                          aria-label="What you say or do"
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          maxLength={1500}
                          rows={3}
                          className="w-full rounded-2xl border bg-background p-3 text-base"
                          placeholder="Say something, describe an action, or let the moment unfold…"
                        />
                        <button
                          disabled={busy || !text.trim()}
                          className="min-h-11 rounded-full bg-primary px-5 text-primary-foreground"
                        >
                          {busy ? "Continuing…" : "Continue"}
                        </button>
                      </form>
                      <button
                        disabled={busy}
                        onClick={() => void act(scene, "pause")}
                        className="min-h-11 rounded-full border px-4"
                      >
                        Pause
                      </button>
                    </>
                  )}
                  {["interactive", "paused"].includes(scene.state) && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={busy || !history.data?.moments.length}
                        onClick={() => void act(scene, "finish", "close_now")}
                        className="min-h-11 rounded-full border px-4"
                      >
                        Finish experience
                      </button>
                      <button
                        disabled={busy || !history.data?.moments.length}
                        onClick={() => void act(scene, "finish")}
                        className="min-h-11 rounded-full border px-4"
                      >
                        Finish remaining portion automatically
                      </button>
                    </div>
                  )}
                  {scene.state === "completed" && (
                    <p className="whitespace-pre-wrap text-sm">{scene.summary}</p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </Screen>
    </>
  );
}
