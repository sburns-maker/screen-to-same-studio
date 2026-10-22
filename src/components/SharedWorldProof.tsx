import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { developerSharedWorld } from "@/lib/shared-world.functions";
export function SharedWorldProof() {
  const call = useServerFn(developerSharedWorld);
  const [id, setId] = useState<string>(() => crypto.randomUUID());
  const [start, setStart] = useState("");
  const [title, setTitle] = useState("A small family gathering");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (
    action: "preview" | "create" | "invite" | "inspect" | "cancel" | "reschedule",
  ) => {
    setBusy(true);
    try {
      const r = await call({
        data: {
          action,
          planId: id,
          startsAt: start ? new Date(start).toISOString() : new Date().toISOString(),
          title,
        },
      });
      setResult(JSON.stringify(r, null, 2));
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Shared-world action failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-4 rounded-2xl bg-surface p-4">
      <h2 className="font-semibold">Shared-world proof · Ben and Claire</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Preview is read-only. Create writes a fictional plan for Ben; Claire is unaware until you
        explicitly relay the invitation. The backend tick decides her response and advances the
        event. Real-Time conversations are required. No user attendance is assumed. Check existing dates first: legacy memories are not yet a complete reservation calendar. Running a world
        tick can send normal paid replies/photos.
      </p>
      <label className="mt-3 block text-sm">
        Title
        <input
          className="block w-full rounded border bg-background p-2"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="mt-3 block text-sm">
        Start (device local time)
        <input
          className="block w-full rounded border bg-background p-2"
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      <label className="mt-2 block text-xs">
        Plan ID
        <input
          className="block w-full rounded border bg-background p-2 font-mono"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ["preview", "Preview 7 days"],
            ["create", "Create plan"],
            ["invite", "Relay invitation to Claire"],
            ["inspect", "Inspect"],
            ["reschedule", "Reschedule"],
            ["cancel", "Cancel"],
          ] as const
        ).map(([action, label]) => (
          <button
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
            key={action}
            disabled={busy || (!start && action !== "inspect")}
            onClick={() => void run(action)}
          >
            {label}
          </button>
        ))}
        <button
          className="rounded border px-3 py-2 text-sm"
          disabled={busy}
          onClick={() => {
            setId(crypto.randomUUID());
            setResult("");
          }}
        >
          New plan ID
        </button>
      </div>
      <pre role="status" className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs">
        {result}
      </pre>
    </section>
  );
}
