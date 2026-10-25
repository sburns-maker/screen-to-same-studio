import { useState } from "react";
import { PLACE_REGISTRY } from "@/lib/place-registry";
import { eventDay } from "@/lib/calendar-view";

type Values = {
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  place: string | null;
  confirmed: boolean;
};

export function PlanEditor({
  plan,
  onSave,
  onCancel,
}: {
  plan: {
    title: string;
    starts_at: string | null;
    date_local: string | null;
    time_local: string | null;
    duration_minutes: number;
    place_key: string | null;
    status: string;
  };
  onSave: (v: Values) => Promise<void>;
  onCancel: () => void;
}) {
  const localTime = plan.starts_at
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(plan.starts_at))
    : (plan.time_local ?? "");
  const [v, setV] = useState<Values>({
    title: plan.title,
    date: eventDay(plan) ?? "",
    time: localTime,
    durationMinutes: plan.duration_minutes,
    place: plan.place_key,
    confirmed: plan.status === "accepted",
  });
  const [busy, setBusy] = useState(false);
  const field = "mt-1 min-h-11 w-full rounded-xl border bg-background p-2";
  const places = PLACE_REGISTRY;
  return (
    <form
      aria-label="Edit plan"
      className="grid gap-3 border-t pt-3 sm:grid-cols-2"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setBusy(true);
        await onSave(v);
        setBusy(false);
      }}
    >
      <label className="text-sm">
        Activity
        <input required maxLength={120} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} className={field} />
      </label>
      <label className="text-sm">
        Venue
        <select value={v.place ?? ""} onChange={(e) => setV({ ...v, place: e.target.value || null })} className={field}>
          <option value="">Keep current</option>
          {places.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Date
        <input required type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className={field} />
      </label>
      <label className="text-sm">
        Time (Eastern)
        <input required type="time" value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} className={field} />
      </label>
      <label className="text-sm">
        Duration (minutes)
        <input type="number" min={15} max={720} value={v.durationMinutes} onChange={(e) => setV({ ...v, durationMinutes: Number(e.target.value) })} className={field} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={v.confirmed} onChange={(e) => setV({ ...v, confirmed: e.target.checked })} />
        We both agreed — mark Confirmed
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button disabled={busy} className="min-h-11 rounded-full bg-primary px-4 text-sm text-primary-foreground">
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full border px-4 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
