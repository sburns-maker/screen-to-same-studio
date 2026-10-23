import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, Trophy, Check } from "lucide-react";
import { useInteractiveWorld } from "@/lib/use-interactive-world";
import { progressVenueExperience } from "@/lib/interactive-world.functions";
import {
  EXPERIENCE_TEMPLATES,
  experienceForPlace,
  experienceKey,
  experienceSummary,
  type ExperienceKind,
  type ExperienceState,
} from "@/lib/venue-experiences";
import { placeByKey } from "@/lib/place-registry";
import { characterFor } from "@/lib/characters";
import { card } from "./TownLayout";
export function VenueExperience({ placeKey }: { placeKey: string }) {
  const q = useInteractiveWorld(),
    progress = useServerFn(progressVenueExperience),
    cache = useQueryClient();
  const [busy, setBusy] = useState(false),
    pending = useRef(new Map<string, string>());
  const place = placeByKey(placeKey),
    session = q.data?.session;
  if (
    !q.data?.experiencesEnabled ||
    !place ||
    session?.place_key !== placeKey ||
    session.departed_at
  )
    return null;
  const kinds = experienceForPlace(place.kind),
    records =
      (session.state as { experiences?: Record<string, ExperienceState> }).experiences ?? {};
  async function choose(kind: ExperienceKind, step: number, choice: number, planId?: string) {
    setBusy(true);
    const key = JSON.stringify([session!.id, kind, step, choice, planId]),
      id = pending.current.get(key) ?? crypto.randomUUID();
    pending.current.set(key, id);
    try {
      await progress({
        data: { id, place: placeKey, kind, step, choice, ...(planId ? { planId } : {}) },
      });
      pending.current.delete(key);
      await cache.invalidateQueries({ queryKey: ["interactive-world"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {kinds.map((kind) => {
        const plan = q.data!.plans.find(
          (p) =>
            p.place_key === placeKey &&
            p.status === "in_progress" &&
            [kind, "meetup"].includes(p.category) &&
            q.data!.companions.some((c) => c.plan_id === p.id),
        );
        const e = records[experienceKey(kind, plan?.id)],
          template = EXPERIENCE_TEMPLATES[kind],
          step = e ? template.steps[e.step] : null,
          last = e?.answers.at(-1);
        return (
          <section key={kind} aria-label={template.title} className={`${card} space-y-4`}>
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-primary/10 p-3">
                {kind === "trivia" ? (
                  <Trophy className="h-5 w-5" />
                ) : (
                  <BookOpen className="h-5 w-5" />
                )}
              </span>
              <div>
                <h3 className="font-display text-xl">{template.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {plan
                    ? `With ${characterFor(plan.organizer).preferredName}`
                    : "Your own activity · no companion attendance assumed"}
                </p>
              </div>
            </div>
            {!e ? (
              <>
                <p className="text-sm text-muted-foreground">{template.intro}</p>
                <button
                  disabled={busy}
                  onClick={() => void choose(kind, -1, -1, plan?.id)}
                  className="min-h-12 w-full rounded-full bg-primary px-4 text-sm text-primary-foreground"
                >
                  {kind === "trivia"
                    ? "Join the Window Table team"
                    : "Check in and join the discussion"}
                </button>
              </>
            ) : (
              <>
                <div
                  className="flex gap-1"
                  aria-label={`Progress ${e.step} of ${template.steps.length}`}
                >
                  {template.steps.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${i < e.step ? "bg-primary" : "bg-primary/15"}`}
                    />
                  ))}
                </div>
                <p role="status" className="text-sm font-medium">
                  {experienceSummary(e)}
                </p>
                {last && (
                  <p className="rounded-xl bg-primary/5 p-3 text-sm">
                    {kind === "trivia"
                      ? `${last.correct ? "Correct" : "Not this time"}: `
                      : "Your last contribution: "}
                    {last.choice}
                  </p>
                )}
                {e.status === "completed" ? (
                  <div className="rounded-2xl border border-primary/25 p-4">
                    <p className="flex items-center gap-2 font-medium">
                      <Check className="h-4 w-4" />{" "}
                      {kind === "trivia" ? "Results are in" : "Your contributions are recorded"}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {plan
                        ? "This shared activity is remembered. Talk a little longer or leave when you’re ready; your plan closes on departure."
                        : "You can revisit your choices in this visit’s history. Chat with someone nearby or enjoy a quiet moment."}
                    </p>
                  </div>
                ) : (
                  step && (
                    <fieldset disabled={busy} className="space-y-2">
                      <legend className="mb-3 text-base font-medium">
                        {kind === "trivia" ? `Round ${e.step + 1}: ` : ""}
                        {step.prompt}
                      </legend>
                      {step.choices.map((label, i) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => void choose(kind, e.step, i, plan?.id)}
                          className="min-h-12 w-full rounded-xl border bg-background p-3 text-left text-sm transition-colors hover:bg-primary/5 disabled:opacity-50"
                        >
                          {label}
                        </button>
                      ))}
                    </fieldset>
                  )
                )}
                <details className="text-sm">
                  <summary className="min-h-11 cursor-pointer py-3 text-muted-foreground">
                    Your recorded contributions
                  </summary>
                  <ol className="space-y-2">
                    {e.answers.map((a, i) => (
                      <li key={i} className="rounded-xl border p-3">
                        <p className="text-xs text-muted-foreground">{a.prompt}</p>
                        <p className="mt-1">{a.choice}</p>
                      </li>
                    ))}
                  </ol>
                </details>
              </>
            )}
          </section>
        );
      })}
    </>
  );
}
