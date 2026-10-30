import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { developerPhotoLab } from "@/lib/developer-photo-lab.functions";
import {
  PHOTO_LAB_PRESETS,
  type PhotoLabType,
  type PhotoLabResult,
} from "@/lib/developer-photo-lab";
type Snapshot = {
  character: string;
  types: { type: PhotoLabType; label: string; supported: boolean }[];
  results: PhotoLabResult[];
};
export function DeveloperPhotoLab({ conversationId }: { conversationId: string }) {
  const command = useServerFn(developerPhotoLab);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{ category: PhotoLabType; id: string } | null>(null);
  type MatureCategory = "mature_romantic" | "mature_adult" | "suggestive";
  const [scenes, setScenes] = useState<Record<MatureCategory,string[][]>>({
    mature_romantic: [["", "", ""]],
    mature_adult: [["", "", ""]],
    suggestive: [["", "", ""]],
  });
  const [chosen, setChosen] = useState<Record<MatureCategory,number>>({ mature_romantic: 0, mature_adult: 0, suggestive: 0 });
  useEffect(() => {
    const next: Record<MatureCategory,string[][]> = { mature_romantic: [["", "", ""]], mature_adult: [["", "", ""]], suggestive: [["", "", ""]] };
    for (const category of ["mature_romantic", "mature_adult", "suggestive"] as const) {
      try {
        const raw = localStorage.getItem(`photo-lab-scenes:${conversationId}:${category}`);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        next[category] = [Array.isArray(parsed) && parsed.length === 3
          ? parsed.map((v) => typeof v === "string" ? v.slice(0,400) : "") : ["","",""]];
      } catch { /* local storage disabled */ }
    }
    setScenes(next);
    setChosen({ mature_romantic: 0, mature_adult: 0, suggestive: 0 });
  }, [conversationId]);
  function updateScene(category: MatureCategory, index: number, value: string) {
    const previous = scenes[category][0] ?? ["","",""];
    const values = previous.map((v, i) => i === index ? value.slice(0,400) : v);
    setScenes(old => ({ ...old, [category]: [values] }));
    try { localStorage.setItem(`photo-lab-scenes:${conversationId}:${category}`, JSON.stringify(values)); }
    catch { /* private browsing */ }
  }
  const refresh = useCallback(async () => {
    const r = await command({ data: { action: "list", conversationId } });
    if (r.snapshot) setSnapshot(r.snapshot);
    return r.snapshot;
  }, [command, conversationId]);
  useEffect(() => {
    setSnapshot(null);
    pending.current = null;
    void refresh().catch((e) =>
      setError(e instanceof Error ? e.message : "Photo tests unavailable"),
    );
  }, [conversationId, refresh]);
  async function generate(category: PhotoLabType) {
    if (busy) return;
    setBusy(true);
    setError("");
    const request = pending.current ?? { category, id: crypto.randomUUID() };
    if (request.category !== category) {
      setError("Check the previous test status before starting another category.");
      setBusy(false);
      return;
    }
    pending.current = request;
    try {
      const r = await command({
        data: {
          action: "generate",
          conversationId,
          category,
          requestId: request.id,
          ...((category === "mature_romantic" || category === "mature_adult" || category === "suggestive") &&
              scenes[category][0]?.[chosen[category]]?.trim()
            ? { customScene: scenes[category][0]![chosen[category]]!.trim() } : {}),
          confirmation: "GENERATE DEVELOPER PHOTO TEST",
        },
      });
      if (r.result) {
        setSnapshot((old) =>
          old
            ? {
                ...old,
                results: [r.result!, ...old.results.filter((x) => x.id !== r.result!.id)].slice(
                  0,
                  12,
                ),
              }
            : old,
        );
        pending.current = null;
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message + " Check test status before requesting another image.");
    } finally {
      setBusy(false);
    }
  }
  async function check(release?: string) {
    setBusy(true);
    setError("");
    try {
      if (release) await command({ data: { action: "release", conversationId, id: release } });
      const latest = await refresh();
      if (release || latest?.results.some((r) => r.requestId === pending.current?.id))
        pending.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const active = snapshot?.results.find((r) => r.status === "running");
  return (
    <div className="space-y-3" aria-label="Developer photo category tests">
      <p>
        Generate an exact category for {snapshot?.character ?? "this contact"}. These are rendering
        tests, separate from character willingness.
      </p>
      <p className="text-xs text-muted-foreground">
        Bypasses chat cooldowns, relationship eligibility, chat photo preferences and current
        activity. Uses approved identity and normal image screening. Does not send chat messages or
        change memories, scores, boundaries or profile photos. Tests share your image budget and may
        incur charges, including the existing bounded identity retry.
      </p>
      {error && (
        <p role="alert" className="rounded-xl border border-destructive p-3">
          {error}
        </p>
      )}
      {(["mature_romantic", "suggestive", "mature_adult"] as const).map((category) => (
        <details key={category} className="rounded-xl border p-3">
          <summary className="cursor-pointer font-medium">
            {category === "mature_romantic" ? "Mature Romantic" : category === "suggestive" ? "Suggestive" : "Mature Adult"} — 3 custom scene options
          </summary>
          <p className="my-2 text-xs text-muted-foreground">
            Describe clothing, pose, setting and atmosphere. Each option is blank until you fill it in.
            Stored on this device for this character. Only used for explicit developer tests, not automatic photos.
          </p>
          <div className="space-y-3">
            {(scenes[category][0] ?? ["","",""]).map((value,index) => (
              <label key={index} className="block space-y-1">
                <span className="flex items-center gap-2 text-sm">
                  <input type="radio" name={`scene-${category}-${conversationId}`}
                    checked={chosen[category] === index}
                    onChange={() => setChosen(old => ({...old, [category]: index}))}/>
                  Custom scene {index + 1}
                </span>
                <textarea aria-label={`${category} custom scene ${index+1}`}
                  rows={3} maxLength={400} value={value}
                  onChange={e => updateScene(category,index,e.target.value)}
                  placeholder="Describe an adult, non-explicit photo scene..."
                  className="w-full rounded-xl border bg-background p-3 text-sm"/>
              </label>
            ))}
          </div>
        </details>
      ))}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {snapshot?.types.map((t) => (
          <button
            key={t.type}
            disabled={busy || !!active || !t.supported}
            onClick={() => void generate(t.type)}
            className="min-h-11 rounded-full border px-3 py-2 text-sm disabled:opacity-50"
          >
            Generate {t.label} test{!t.supported ? " — unavailable" : ""}
          </button>
        ))}
      </div>
      <button
        disabled={busy}
        onClick={() => void check()}
        className="min-h-11 rounded-full border px-3"
      >
        Check test status / refresh preview
      </button>
      {active && (
        <p role="status">
          A category test is running. Normal chat reservations do not block these tests.
        </p>
      )}
      {active?.recoverable && (
        <button
          disabled={busy}
          onClick={() => void check(active.id)}
          className="min-h-11 rounded-full border px-3"
        >
          Release expired test reservation
        </button>
      )}
      {snapshot?.results.map((r) => (
        <article key={r.id} className="space-y-2 rounded-xl border p-3">
          <p>
            {PHOTO_LAB_PRESETS[r.category].label} · {r.status}
          </p>
          {r.reason && <p className="text-sm">{r.reason}</p>}
          {r.status === "stored" && (
            <p>Image stored. Refresh its private preview link; no regeneration is needed.</p>
          )}
          {r.url && (
            <img
              src={r.url}
              alt={`${snapshot.character} ${PHOTO_LAB_PRESETS[r.category].label} developer test`}
              className="max-h-[65dvh] w-full rounded-xl object-contain"
              loading="lazy"
            />
          )}
          <details>
            <summary className="min-h-11 cursor-pointer text-xs">Test details</summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
              {JSON.stringify(
                { id: r.id, category: r.category, status: r.status, diagnostics: r.diagnostics },
                null,
                2,
              )}
            </pre>
          </details>
        </article>
      ))}
    </div>
  );
}
