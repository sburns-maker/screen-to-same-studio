import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { debugSnapshot } from "@/lib/tess.functions";
import { STATE_KEYS, type TessState } from "@/lib/tess-logic";

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

type Snapshot = {
  state: TessState;
  lastDelta: Record<string, number | string | string[]>;
  lastTone: string | null;
  stage: string;
  difficulty: string;
  realTimeMode: boolean;
  schedule: { activity: string; availability: string; detail: string };
  lifeEvent: { summary: string; mood: string } | null;
  weather: { condition: string; temperature_f: number; wind_mph: number; weather_region: string } | null;
  weatherFlavor: string | null;
  gapHours: number;
  initiation: {
    eligible: boolean;
    reasons: string[];
    score: number;
    chance: number;
    nextWindowHours: number | null;
    lastCheck: Record<string, unknown> | null;
    lastInitiatedAt: string | null;
  };
  photo: { eligible: boolean; reason: string; curatedCount: number; generatedTypes: string[] };
  latencyReason: string | null;
  recentMemories: { memory_type: string; summary: string; importance: number; created_at: string }[];
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="mt-2 text-sm">{children}</div>
    </section>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-0.5 font-mono text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v ?? "—"}</span>
    </div>
  );
}

function Debug() {
  const fn = useServerFn(debugSnapshot);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () => fn().then((d) => !stop && setSnap(d as Snapshot)).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [fn]);

  const s = snap?.state;
  const delta = snap?.lastDelta ?? {};
  const tags = Array.isArray(delta["tags"]) ? (delta["tags"] as string[]) : [];

  return (
    <>
      <ScreenHeader title="Simulation debug" />
      <Screen>
        {!snap && <p className="text-sm text-muted-foreground">Loading…</p>}
        {snap && s && (
          <>
            <div className="rounded-2xl bg-surface p-4">
              <div className="text-xs text-muted-foreground">Stage</div>
              <div className="font-display text-2xl">{snap.stage}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Last tone: {snap.lastTone ?? "—"} · Difficulty: {snap.difficulty} · Real-Time: {snap.realTimeMode ? "on" : "off"}
              </div>
              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {tags.map((t) => (
                    <span key={t} className="rounded-full bg-accent px-2 py-0.5 font-mono text-[11px] text-accent-foreground">{t}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2.5 rounded-2xl bg-surface p-4">
              {STATE_KEYS.map((k) => {
                const d = Number(delta[k] ?? 0);
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

            <Section title="Her world right now">
              <KV k="activity" v={snap.schedule.activity} />
              <KV k="availability" v={snap.schedule.availability} />
              <KV k="detail" v={snap.schedule.detail} />
              <KV k="life event" v={snap.lifeEvent ? `${snap.lifeEvent.summary} (${snap.lifeEvent.mood})` : "none"} />
              <KV
                k="weather"
                v={snap.weather ? `${snap.weather.condition}, ${snap.weather.temperature_f}°F, wind ${snap.weather.wind_mph}mph (${snap.weather.weather_region})` : "unavailable"}
              />
              {snap.weatherFlavor && <KV k="weather flavor" v={snap.weatherFlavor} />}
            </Section>

            <Section title="Initiation">
              <KV k="gap since last msg" v={`${snap.gapHours}h`} />
              <KV k="eligible now" v={snap.initiation.eligible ? "yes" : "no"} />
              <KV k="inclination score" v={`${snap.initiation.score}/100`} />
              <KV k="chance this check" v={`${Math.round(snap.initiation.chance * 100)}%`} />
              {snap.initiation.nextWindowHours != null && <KV k="next window" v={`in ~${snap.initiation.nextWindowHours.toFixed(1)}h`} />}
              <KV k="last initiated" v={snap.initiation.lastInitiatedAt ? new Date(snap.initiation.lastInitiatedAt).toLocaleString() : "never"} />
              <div className="mt-2 border-t pt-2">
                <div className="text-xs font-semibold text-muted-foreground">Why / why not</div>
                <ul className="mt-1 space-y-1 font-mono text-[11px] text-muted-foreground">
                  {snap.initiation.reasons.map((r, i) => (
                    <li key={i}>· {r}</li>
                  ))}
                </ul>
              </div>
              {!!snap.initiation.lastCheck && (
                <div className="mt-2 border-t pt-2 font-mono text-[11px] text-muted-foreground">
                  last check: {JSON.stringify(snap.initiation.lastCheck)}
                </div>
              )}
            </Section>

            <Section title="Photo eligibility">
              <KV k="eligible" v={snap.photo.eligible ? "yes" : "no"} />
              <KV k="why" v={snap.photo.reason} />
              <KV k="curated available" v={snap.photo.curatedCount} />
              <KV k="generated types" v={snap.photo.generatedTypes.join(", ") || "none"} />
            </Section>

            <Section title="Last response delay">
              <p className="font-mono text-xs text-muted-foreground">{snap.latencyReason ?? "—"}</p>
            </Section>

            <Section title="Recent memories">
              {(snap.recentMemories ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing saved yet.</p>}
              <ul className="space-y-1.5">
                {(snap.recentMemories ?? []).map((m, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {m.memory_type} · {m.importance} · {new Date(m.created_at).toLocaleDateString()}
                    </span>
                    <div>{m.summary}</div>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
      </Screen>
    </>
  );
}
