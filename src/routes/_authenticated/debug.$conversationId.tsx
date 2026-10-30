import { HousingDiagnostics } from "@/components/HousingDiagnostics";
import { DeveloperPhotoLab } from "@/components/DeveloperPhotoLab";
import {SchedulingDebug} from "@/components/SchedulingDebug";
import { LivingExperiencesDebug } from "@/components/LivingExperiencesDebug";
import { CallsDebug } from "@/components/CallsDebug";
import { InteractiveWorldDebug } from "@/components/InteractiveWorldDebug";
import { photoTestStatus } from "@/lib/photo-test-status";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { debugSnapshot, developerPhotoOpportunity, developerPhotoReservation, developerResetPhotoBoundary } from "@/lib/tess.functions";
import { STATE_KEYS, type TessState } from "@/lib/tess-logic";
import { mindSummary, recentMindChanges, datedMemories } from "@/lib/character-mind-insights";
import { RelationshipHistoryPanel } from "@/components/RelationshipHistoryPanel";

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
  dialogueDelivery?: { revision: string; character: string; recentPatterns: string[]; repeatedRoutines: string[] } | null;
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

function Section({ title, children, collapsible = false }: { title: string; children: React.ReactNode; collapsible?: boolean }) {
  if (collapsible) return <details className="mt-4 rounded-2xl bg-surface p-4 group"><summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}<span className="ml-2 text-[10px] normal-case font-normal">Tap to expand</span></summary><div className="mt-3 text-sm">{children}</div></details>;
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
  const [activeTab, setActiveTab] = useState<"mind" | "world" | "social" | "photos" | "technical">("mind");
  const [refreshing, setRefreshing] = useState(false);
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
  const reservationFn = useServerFn(developerPhotoReservation);
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
      const requestId=mode === "preview"?crypto.randomUUID():photoRequestId;
      if(mode === "preview")setPhotoRequestId(requestId);
      const result = await photoFn({ data: { conversationId, requestId, mode, context: photoContext, expectedSceneVersion: mode === "deliver" && typeof photoResult?.["previewSceneVersion"] === "string" ? photoResult["previewSceneVersion"] : undefined } });
      setPhotoResult(result as unknown as Record<string, unknown>);
    } catch (e) {
      setPhotoResult({ error: e instanceof Error ? e.message : "Photo action failed" });
    } finally { setPhotoBusy(false); }
  };
  const checkReservation = async (recover: boolean) => {
    setPhotoBusy(true);
    try {
      const result = await reservationFn({ data: { conversationId, recover } });
      setPhotoResult(result as unknown as Record<string, unknown>);
    } catch (e) {
      setPhotoResult({ error: e instanceof Error ? e.message : "Delivery status unavailable" });
    } finally { setPhotoBusy(false); }
  };
  const photoStatus = photoTestStatus(photoResult, photoBusy);
  const reservation = photoResult?.["reservation"] as { phase?: string; startedAt?: string; ageSeconds?: number | null; recoverable?: boolean } | undefined;
  const s = snap?.state;
  const delta = snap?.lastDelta ?? {};
  const tags = Array.isArray(delta["tags"]) ? (delta["tags"] as string[]) : [];

  return (
    <>
      <ScreenHeader title={`Simulation debug · ${snap?.character.name ?? ""}`} backTo="/chat/$conversationId" backParams={{ conversationId }} />
      <Screen>
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border bg-surface p-3">
          <div className="min-w-0"><strong className="block truncate text-sm">{snap?.character.name ?? "Character"}</strong><span className="text-xs text-muted-foreground">{snap?.stage ?? "Loading"} · {snap?.schedule.availability ?? "—"}</span></div>
          <button type="button" disabled={refreshing} className="shrink-0 rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={() => {
            setRefreshing(true);
            void fn({ data: { conversationId } }).then((next) => setSnap(next as Snapshot)).catch(() => {}).finally(() => setRefreshing(false));
          }}>{refreshing ? "Refreshing…" : "Refresh"}</button>
        </div>
        <nav aria-label="Debug sections" className="sticky top-0 z-10 -mx-4 mb-3 flex gap-2 overflow-x-auto border-b bg-background px-4 py-3">
          {([
            ["mind", "Mind"], ["world", "World"], ["social", "Messages"], ["photos", "Photos"], ["technical", "Technical"],
          ] as const).map(([key, name]) => (
            <button key={key} type="button" aria-pressed={activeTab === key} onClick={() => setActiveTab(key)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium ${activeTab === key ? "bg-primary text-primary-foreground" : "bg-surface"}`}>{name}</button>
          ))}
        </nav>
        {activeTab === "world" && <Link to="/world" className="mb-4 flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-[15px]">
          Living world timeline <span className="text-xs text-muted-foreground">events · jobs · push</span>
        </Link>}
        {activeTab === "mind" && snap && <section className="rounded-2xl bg-surface p-4" aria-label="Simulation overview"><div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">At a glance</div><div className="mt-2 text-lg font-semibold">{snap.stage}</div><p className="text-sm text-muted-foreground mt-1">Currently {snap.schedule.activity} · {snap.schedule.availability} · Real-Time {snap.realTimeMode ? "on" : "off"}</p><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><span className="text-muted-foreground">Messages</span><div className="font-medium">{snap.initiation.eligible ? "Can initiate" : "Waiting"}</div></div><div><span className="text-muted-foreground">Photos</span><div className="font-medium">{snap.photo.eligible ? "Eligible" : "Not eligible"}</div></div></div>{!snap.photo.eligible && <p className="mt-2 text-xs text-muted-foreground">Photo: {snap.photo.reason}</p>}</section>}
        {activeTab === "world" && snap?.photoDeveloperTools&&<Section title="Calendar scheduling" collapsible><SchedulingDebug conversationId={conversationId}/></Section>}
        {activeTab === "world" && snap?.photoDeveloperTools&&<Section title="Homes & households" collapsible><HousingDiagnostics/></Section>}
        {activeTab === "world" && snap?.photoDeveloperTools&&<Section title="Living Experiences" collapsible><LivingExperiencesDebug conversationId={conversationId}/></Section>}
        {activeTab === "social" && snap?.photoDeveloperTools && snap.dialogueDelivery && <Section title="Dialogue delivery" collapsible><p className="text-sm">Active server rules: {snap.dialogueDelivery.revision}</p><p className="mt-2 text-sm">Character: {snap.dialogueDelivery.character}</p><p className="mt-2 text-sm">Recent delivery patterns: {[...snap.dialogueDelivery.recentPatterns, ...snap.dialogueDelivery.repeatedRoutines].join(", ") || "None detected"}</p><p className="mt-2 text-xs text-muted-foreground">This identifies the current server rules, not a quality score or proof that earlier replies used them. Only same-conversation visible text is analyzed; no private transcript is shown.</p></Section>}
        {activeTab === "social" && snap?.photoDeveloperTools&&<Section title="Calls" collapsible><CallsDebug conversationId={conversationId}/></Section>}
        {activeTab === "technical" && snap?.photoDeveloperTools && <Link to="/voice-studio" className="mb-3 block rounded-2xl border bg-surface p-4 text-sm font-medium">🎙️ Open Voice Studio <span className="block text-xs font-normal text-muted-foreground">Create and compare private fictional character voices</span></Link>}
        {activeTab === "world" && snap?.photoDeveloperTools&&<Section title="Interactive world & calendar" collapsible><InteractiveWorldDebug/></Section>}
        {activeTab === "photos" && snap?.photoDeveloperTools && snap.photography ? <Section title="Character photography" collapsible><p className="text-xs text-muted-foreground">Soft tendencies, grounded scenario candidates and recent delivered-photo continuity. No full prompt or transcript is exposed. The current preview is illustrative; the latest generation records the actual selection.</p><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(snap.photography,null,2)}</pre></Section> : null}
        {activeTab === "photos" && snap?.photoDeveloperTools && <Section title="Photo category lab (developer only)" collapsible><DeveloperPhotoLab key={conversationId} conversationId={conversationId}/></Section>}
        {activeTab === "photos" && snap?.photoDeveloperTools && (
          <Section title="Photo boundaries (developer)">
            <p className="text-xs text-muted-foreground">Current saved setting: <strong>{snap.photoBoundary === "selfies" ? "No selfies" : snap.photoBoundary === "all_photos" ? "No photos" : snap.photoBoundary === "mature" ? "No mature romantic photos" : "No restriction"}</strong>. This is a persisted conversation preference, not a cooldown.</p>
            {snap.photoBoundary !== "none" && <button type="button" className="mt-3 rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={resetBusy} onClick={() => void runReset()}>{resetBusy ? "Resetting…" : "Reset saved photo boundary"}</button>}
            {resetStatus && <p role="status" className="mt-2 text-xs">{resetStatus}</p>}
          </Section>
        )}
        {activeTab === "photos" && snap?.photoDeveloperTools && (
          <Section title="Controlled photo opportunity">
            <p className="text-xs text-muted-foreground">Preview checks eligibility without generating or changing data. Deliver asks the character through the normal pipeline; she may decline. A delivered image uses your configured image provider and can incur charges. Current schedules, boundaries and cooldowns still apply.</p>
            <textarea aria-label="Photo opportunity context" className="mt-3 w-full rounded-lg border bg-background p-2" maxLength={1500} placeholder="A current visual moment grounded in this conversation's established memories…" value={photoContext}
              onChange={(e) => { setPhotoContext(e.target.value); setPhotoRequestId(crypto.randomUUID()); setPhotoResult(null); }} />
            <p role="status" aria-live="polite" className="mt-3 rounded-lg border p-3 text-sm">{photoStatus.message}</p>
            <div className="mt-2 flex gap-3">
              <button className="rounded-lg border bg-surface px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50" disabled={photoBusy || !photoContext.trim()} onClick={() => void testPhoto("preview")}>Preview eligibility</button>
              <button className="rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-60" disabled={!photoStatus.canDeliver} onClick={() => void testPhoto("deliver")}>Ask character to share</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <button className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={photoBusy} onClick={() => void checkReservation(false)}>Check delivery status</button>
              {reservation?.recoverable && <button className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={photoBusy} onClick={() => void checkReservation(true)}>Recover existing request</button>}
            </div>
            {reservation && <p className="mt-2 text-xs text-muted-foreground">Phase: {reservation.phase}. Started: {reservation.startedAt ? new Date(reservation.startedAt).toLocaleString() : "unknown"}. Recovery only delivers an already prepared response or releases an expired reservation; it never generates another image.</p>}
            {photoStatus.showChat && <Link className="mt-3 block underline" to="/chat/$conversationId" params={{ conversationId }}>Open conversation</Link>}
            {!!photoResult?.["photoValidation"] && <div className="mt-3 rounded-xl border p-3 text-sm"><p>Current location: {String((photoResult["photoValidation"] as Record<string,unknown>)["canonicalLocation"]??"unknown")}</p><p>Requested scene: {String((photoResult["photoValidation"] as Record<string,unknown>)["inferredRequestedScene"]??"unspecified")}</p><p>Validation: {String((photoResult["photoValidation"] as Record<string,unknown>)["failedRule"]??"location check passed")} · {String((photoResult["photoValidation"] as Record<string,unknown>)["stage"]??"")}</p>{Boolean((photoResult["photoValidation"] as Record<string,unknown>)["failedField"]) && <p>Rejected field: {String((photoResult["photoValidation"] as Record<string,unknown>)["failedField"])}</p>}{Boolean((photoResult["photoValidation"] as Record<string,unknown>)["selectedType"]) && <p>Selected photo category: {String((photoResult["photoValidation"] as Record<string,unknown>)["selectedType"])}</p>}</div>}
            {photoResult && <details className="mt-3 text-xs"><summary>Technical details</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{JSON.stringify(photoResult, null, 2)}</pre></details>}
          </Section>
        )}
        {!snap && <p className="text-sm text-muted-foreground">Loading…</p>}
        {snap && s && (
          <>
            {activeTab === "photos" && snap.photoDeveloperTools && snap.photoIdentity && <Section title="Canonical photo identity" collapsible>
              <p className="text-xs text-muted-foreground">The existing profile portrait is the generation anchor. Visual screening can miss drift; compare the actual images. Historic images may have no validation record.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <figure><img src={snap.photoIdentity.profileUrl} alt="Authoritative existing profile portrait" className="w-full rounded-lg" /><figcaption className="text-xs">Canonical profile</figcaption></figure>
                {snap.photoIdentity.comparisonUrl && <figure><img src={snap.photoIdentity.comparisonUrl} alt="Most recent delivered generated photograph for comparison" className="w-full rounded-lg" /><figcaption className="text-xs">Latest delivered generation</figcaption></figure>}
              </div>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({canonical:snap.photoIdentity.canonical,latest:snap.photoIdentity.latest,source:snap.photoIdentity.source,delivery:snap.photoIdentity.delivery},null,2)}</pre>
            </Section>}
            {activeTab === "technical" && snap.photoDeveloperTools && <Section title="Persistent world diagnostics" collapsible>
              <p className="text-xs text-muted-foreground">Current backend checkpoint, pending intentions, photo decisions, delivery events and monthly image attempts. Schedule preview advances no data or relationship scores. Global worker history is on Living world timeline.</p>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(snap.world, null, 2)}</pre>
            </Section>}
            {activeTab === "mind" && <div className="rounded-2xl bg-surface p-4">
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
            </div>}

            {activeTab === "mind" && <div className="mt-4 space-y-2.5 rounded-2xl bg-surface p-4">
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
            </div>}

            {activeTab === "mind" && <Section title="Character mind · relationship intelligence">
              <p className="text-xs text-muted-foreground">Based on saved game state, changes from the latest evaluated turn, and dated memories. This is a simulation diagnostic, not secret thoughts or certainty about motives.</p>
              <div className="mt-3 rounded-xl border bg-background p-3">
                <p className="text-xs text-muted-foreground">Current relationship stage</p>
                <strong className="text-lg">{snap.stage}</strong>
                <p className="mt-1 text-xs text-muted-foreground">Latest observed tone: {snap.lastTone ?? "not recorded"}</p>
                <div className="mt-3 space-y-2">
                  {mindSummary(s,snap.stage).notes.map((note,i)=><p key={i} className="text-sm">• {note}</p>)}
                </div>
              </div>
              <div className="mt-4">
                <h4 className="font-semibold">What changed in the last evaluated turn?</h4>
                {recentMindChanges(delta).length ? <div className="mt-2 grid grid-cols-2 gap-2">
                  {recentMindChanges(delta).map(({key,value})=><div key={key} className="rounded-lg border bg-background p-2">
                    <div className="text-xs text-muted-foreground">{key.replace(/_/g," ")}</div>
                    <strong className={value>0?"text-emerald-700 dark:text-emerald-400":"text-amber-700 dark:text-amber-400"}>{value>0?"+":""}{value}</strong>
                  </div>)}
                </div> : <p className="mt-1 text-sm text-muted-foreground">No numerical changes were recorded in the latest evaluation. That does not mean nothing happened.</p>}
                <p className="mt-2 text-xs text-muted-foreground">Event tags: {tags.length?tags.join(", "):"none recorded"}. Changes are limited to the latest evaluation; older turn-by-turn changes are not available in this snapshot.</p>
              </div>
              <div className="mt-4 border-t pt-3">
                <h4 className="font-semibold">Relationship events · newest first</h4>
                <p className="mt-1 text-xs text-muted-foreground">Dated, saved memories across categories. These show what the system retained and may explain later references. Plans remain plans until completed.</p>
                {datedMemories(snap.recentMemories).length ? datedMemories(snap.recentMemories).slice(0,12).map((m,i)=><div key={i} className="mt-2 rounded-lg border bg-background p-3">
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>{m.memory_type.replace(/_/g," ")} · importance {m.importance}</span>
                    <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</time>
                  </div>
                  <p className="mt-1 text-sm">{m.summary}</p>
                </div>):<p className="mt-2 text-sm text-muted-foreground">No saved memories for this character yet.</p>}
              </div>
              <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">The timeline dates show when memories were saved, not necessarily when an event occurred. An actual date, invitation or outing needs corresponding world-event evidence to be marked completed.</p>
            </Section>}

            {activeTab === "mind" && <RelationshipHistoryPanel conversationId={conversationId} state={s} stage={snap.stage}/>}

            {activeTab === "world" && <Section title="Their world right now">
              <KV k="activity" v={snap.schedule.activity} />
              <KV k="availability" v={snap.schedule.availability} />
              <KV k="detail" v={snap.schedule.detail} />
              <KV k="life event" v={snap.lifeEvent ? `${snap.lifeEvent.summary} (${snap.lifeEvent.mood})` : "none"} />
              <KV
                k="weather"
                v={snap.weather ? `${snap.weather.condition}, ${snap.weather.temperature_f}°F, wind ${snap.weather.wind_mph}mph (${snap.weather.weather_region})` : "unavailable"}
              />
              {snap.weatherFlavor && <KV k="weather flavor" v={snap.weatherFlavor} />}
            </Section>}

            {activeTab === "social" && <Section title="Initiation">
              <KV k="gap since last msg" v={`${snap.gapHours}h`} />
              <KV k="eligible now" v={snap.initiation.eligible ? "yes" : "no"} />
              <KV k="inclination score" v={`${snap.initiation.score}/100`} />
              <KV k="chance this check" v={`${Math.round(snap.initiation.chance * 100)}%`} />
              {snap.initiation.nextWindowHours != null && <KV k="next window" v={`in ~${snap.initiation.nextWindowHours.toFixed(1)}h`} />}
              <KV k="last initiated" v={snap.initiation.lastInitiatedAt ? new Date(snap.initiation.lastInitiatedAt).toLocaleString() : "never"} />
              {snap.initiation.lastCheck?.["initiated"] === true && typeof snap.initiation.lastCheck["at"] === "string" && (!snap.initiation.lastInitiatedAt || Date.parse(snap.initiation.lastInitiatedAt) < Date.parse(snap.initiation.lastCheck["at"])) && (
                <p role="status" className="mt-2 rounded-lg border p-2 text-xs">The latest initiation check selected an attempt, but there is no newer successful initiation timestamp. This is not proof that a message was delivered. Check pending visibility, generation limits and worker results before concluding that the character ignored you.</p>
              )}
              <div className="mt-2 border-t pt-2">
                <div className="text-xs font-semibold text-muted-foreground">Why / why not</div>
                <ul className="mt-1 space-y-1 font-mono text-[11px] text-muted-foreground">
                  {snap.initiation.reasons.map((r, i) => (
                    <li key={i}>· {r}</li>
                  ))}
                </ul>
              </div>
              {!!snap.initiation.lastCheck && (
                <details className="mt-2 border-t pt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Last initiation check · technical data</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{JSON.stringify(snap.initiation.lastCheck, null, 2)}</pre></details>
              )}
            </Section>}

            {activeTab === "photos" && <Section title="Photo eligibility">
              <KV k="eligible" v={snap.photo.eligible ? "yes" : "no"} />
              <KV k="why" v={snap.photo.reason} />
              <KV k="curated available" v={snap.photo.curatedCount} />
              <KV k="generated types" v={snap.photo.generatedTypes.join(", ") || "none"} />
            </Section>}

            {activeTab === "technical" && <Section title="Last response delay">
              <p className="font-mono text-xs text-muted-foreground">{snap.latencyReason ?? "—"}</p>
            </Section>}

            {activeTab === "mind" && <Section title="Recent memories" collapsible>
              {(snap.recentMemories ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing saved yet.</p>}
              <ul className="space-y-1.5">
                {(snap.recentMemories ?? []).map((m, i) => (
                  <li key={i} className="text-sm">
                    <details open={i === 0 ? true : undefined} className="rounded-lg border p-2">
                      <summary className="cursor-pointer text-sm">
                        <span className="font-medium">{m.memory_type} · {new Date(m.created_at).toLocaleDateString()}</span>
                        <span className="ml-2 text-xs text-muted-foreground">Importance {m.importance}</span>
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap">{m.summary}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </Section>}
          </>
        )}
      </Screen>
    </>
  );
}
