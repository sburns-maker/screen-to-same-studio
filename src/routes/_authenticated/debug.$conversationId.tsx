import { photoTestStatus } from "@/lib/photo-test-status";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { debugSnapshot, developerPhotoOpportunity, developerResetPhotoBoundary } from "@/lib/tess.functions";
import { STATE_KEYS, type TessState } from "@/lib/tess-logic";

export const Route = createFileRoute("/_authenticated/debug/$conversationId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Simulation debug — Chats" },
      { name: "description", content: "Hidden simulation values." },
      { property: "og:title", content: "Simulation debug — Chats" },
      { property: "og:description", content: "Hidden simulation values." },
    ],
  }),
  component: Debug,
});

type Snapshot = {
  world?: Record<string, unknown>;
  photography?: unknown;
  photoIdentity?: { profileUrl: string; comparisonUrl: string | null; canonical: Record<string, string | number> | null; latest: Record<string, unknown> | null; source: string | null; delivery: string } | null;
  photoDeveloperTools: boolean;
  photoBoundary: string;
  character: { key: string; name: string; fullName: string; photosEnabled: boolean };
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
    lastCheck: Record<string, string | number | boolean | string[] | null> | null;
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
  const { conversationId } = Route.useParams();
  const fn = useServerFn(debugSnapshot);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () => fn({ data: { conversationId } }).then((d) => !stop && setSnap(d as Snapshot)).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [fn, conversationId]);

  const photoFn = useServerFn(developerPhotoOpportunity);
  const resetBoundary = useServerFn(developerResetPhotoBoundary);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetStatus, setResetStatus] = useState("");
  const runReset = async () => {
    if (!window.confirm(`Reset ${snap?.character.name ?? "this contact"}'s saved photo boundary? This is a developer-only override and will be audited.`)) return;
    setResetBusy(true);
    try {
      await resetBoundary({ data: { conversationId, confirmation: "RESET PHOTO BOUNDARY" } });
      setResetStatus("Photo boundary reset. This does not force the character to send an image.");
      setPhotoResult(null);
      const next = await fn({ data: { conversationId } });
      setSnap(next as Snapshot);
    } catch (e) { setResetStatus(e instanceof Error ? e.message : "Reset failed"); }
    finally { setResetBusy(false); }
  };
  const [photoContext, setPhotoContext] = useState("");
  const [photoRequestId, setPhotoRequestId] = useState(() => crypto.randomUUID());
  const [photoResult, setPhotoResult] = useState<Record<string, unknown> | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const testPhoto = async (mode: "preview" | "deliver") => {
    setPhotoBusy(true);
    try {
      const result = await photoFn({ data: { conversationId, requestId: photoRequestId, mode, context: photoContext } });
      setPhotoResult(result as unknown as Record<string, unknown>);
    } catch (e) {
      setPhotoResult({ error: e instanceof Error ? e.message : "Photo action failed" });
    } finally { setPhotoBusy(false); }
  };
  const photoStatus = photoTestStatus(photoResult, photoBusy);
  const s = snap?.state;
  const delta = snap?.lastDelta ?? {};
  const tags = Array.isArray(delta["tags"]) ? (delta["tags"] as string[]) : [];

  return (
    <>
      <ScreenHeader title={`Simulation debug · ${snap?.character.name ?? ""}`} backTo="/chat/$conversationId" backParams={{ conversationId }} />
      <Screen>
        <Link to="/world" className="mb-4 flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-[15px]">
          Living world timeline <span className="text-xs text-muted-foreground">events · jobs · push</span>
        </Link>
        {snap?.photoDeveloperTools && snap.photography ? <Section title="Character photography"><p className="text-xs text-muted-foreground">Soft tendencies, grounded scenario candidates and recent delivered-photo continuity. No full prompt or transcript is exposed. The current preview is illustrative; the latest generation records the actual selection.</p><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(snap.photography,null,2)}</pre></Section> : null}
        {snap?.photoDeveloperTools && (
          <Section title="Photo boundaries (developer)">
            <p className="text-xs text-muted-foreground">Current saved setting: <strong>{snap.photoBoundary === "selfies" ? "No selfies" : snap.photoBoundary === "all_photos" ? "No photos" : snap.photoBoundary === "mature" ? "No mature romantic photos" : "No restriction"}</strong>. This is a persisted conversation preference, not a cooldown.</p>
            {snap.photoBoundary !== "none" && <button type="button" className="mt-3 rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={resetBusy} onClick={() => void runReset()}>{resetBusy ? "Resetting…" : "Reset saved photo boundary"}</button>}
            {resetStatus && <p role="status" className="mt-2 text-xs">{resetStatus}</p>}
          </Section>
        )}
        {snap?.photoDeveloperTools && (
          <Section title="Controlled photo opportunity">
            <p className="text-xs text-muted-foreground">Preview checks eligibility without generating or changing data. Deliver asks the character through the normal pipeline; she may decline. A delivered image uses your configured image provider and can incur charges. Current schedules, boundaries and cooldowns still apply.</p>
            <textarea aria-label="Photo opportunity context" className="mt-3 w-full rounded-lg border bg-background p-2" maxLength={1500} placeholder="A current visual moment grounded in this conversation's established memories…" value={photoContext}
              onChange={(e) => { setPhotoContext(e.target.value); setPhotoRequestId(crypto.randomUUID()); setPhotoResult(null); }} />
            <p role="status" aria-live="polite" className="mt-3 rounded-lg border p-3 text-sm">{photoStatus.message}</p>
            <div className="mt-2 flex gap-3">
              <button className="rounded-lg border bg-surface px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50" disabled={photoBusy || !photoContext.trim()} onClick={() => void testPhoto("preview")}>Preview eligibility</button>
              <button className="rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-60" disabled={!photoStatus.canDeliver} onClick={() => void testPhoto("deliver")}>Ask character to share</button>
            </div>
            {photoStatus.showChat && <Link className="mt-3 block underline" to="/chat/$conversationId" params={{ conversationId }}>Open conversation</Link>}
            {photoResult && <details className="mt-3 text-xs"><summary>Technical details</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{JSON.stringify(photoResult, null, 2)}</pre></details>}
          </Section>
        )}
        {!snap && <p className="text-sm text-muted-foreground">Loading…</p>}
        {snap && s && (
          <>
            {snap.photoDeveloperTools && snap.photoIdentity && <Section title="Canonical photo identity">
              <p className="text-xs text-muted-foreground">The existing profile portrait is the generation anchor. Visual screening can miss drift; compare the actual images. Historic images may have no validation record.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <figure><img src={snap.photoIdentity.profileUrl} alt="Authoritative existing profile portrait" className="w-full rounded-lg" /><figcaption className="text-xs">Canonical profile</figcaption></figure>
                {snap.photoIdentity.comparisonUrl && <figure><img src={snap.photoIdentity.comparisonUrl} alt="Most recent delivered generated photograph for comparison" className="w-full rounded-lg" /><figcaption className="text-xs">Latest delivered generation</figcaption></figure>}
              </div>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({canonical:snap.photoIdentity.canonical,latest:snap.photoIdentity.latest,source:snap.photoIdentity.source,delivery:snap.photoIdentity.delivery},null,2)}</pre>
            </Section>}
            {snap.photoDeveloperTools && <Section title="Persistent world diagnostics">
              <p className="text-xs text-muted-foreground">Current backend checkpoint, pending intentions, photo decisions, delivery events and monthly image attempts. Schedule preview advances no data or relationship scores. Global worker history is on Living world timeline.</p>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(snap.world, null, 2)}</pre>
            </Section>}
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

            <Section title="Their world right now">
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
