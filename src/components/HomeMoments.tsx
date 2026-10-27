import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { homeMoments } from "@/lib/home-moments";
import type { HousingHome, HousingSnapshot } from "@/lib/housing";

export function HomeMoments({ home, snapshot, character }: {
  home: HousingHome;
  snapshot: HousingSnapshot;
  character?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const moments = useMemo(() => homeMoments(home, snapshot, character), [home, snapshot, character]);
  const chosen = moments.find((moment) => moment.id === selected);
  return (
    <section aria-label="Home moments" className="space-y-3 rounded-2xl border border-border/70 bg-gradient-to-br from-orange-50/70 via-background to-rose-50/50 p-4 dark:from-orange-950/10 dark:via-background dark:to-rose-950/10 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Life at home</p>
        <h3 className="mt-1 font-display text-xl">Make a moment</h3>
        <p className="mt-1 text-sm text-muted-foreground">Real moments begin with a conversation. Choosing an idea never invents an event or forces a photo.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {moments.map((moment) => (
          <button key={moment.id} type="button" aria-pressed={selected === moment.id}
            onClick={() => { setSelected(moment.id); setCopyStatus(""); }}
            className={`min-h-28 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected === moment.id ? "border-primary bg-primary/10" : "border-border/70 bg-background/85 hover:bg-accent"}`}>
            <span aria-hidden="true" className="text-xl">{({ coffee: "☕", movie: "🎬", cook: "🍳", mabel: "🐾", photo: "📸" } as const)[moment.id]}</span>
            <span className="mt-2 block text-sm font-semibold">{moment.title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{moment.description}</span>
          </button>
        ))}
      </div>
      {chosen && (
        <div className="space-y-2 rounded-xl border border-border/70 bg-background/90 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversation starter</p>
          <p className="text-sm">{chosen.suggestion}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground"
              onClick={() => {
                if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
                  setCopyStatus("Copy unavailable in this browser. Select the text above instead.");
                  return;
                }
                void navigator.clipboard.writeText(chosen.suggestion)
                  .then(() => setCopyStatus("Copied. Paste into your conversation when you're ready."))
                  .catch(() => setCopyStatus("Copy failed. Select the text above instead."));
              }}>
              Copy to conversation
            </button>
            {home.canVisit && <Link to="/place/$placeKey" params={{ placeKey: home.key }}
              className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm">Explore home</Link>}
          </div>
          {copyStatus && <p role="status" className="text-xs text-muted-foreground">{copyStatus}</p>}
          {chosen.id === "photo" && <p className="text-xs text-muted-foreground">The character decides whether to share. The existing photo system handles eligibility, generation and storage; this screen does not create an image.</p>}
        </div>
      )}
    </section>
  );
}
