import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { allLocalSubscriptions, findPushRegistration, getPushRegistration } from "@/lib/pwa/register-sw";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { deleteAllData, resetRelationship, updateSettings } from "@/lib/tess.functions";
import { pushStatus, quietHours, removePushSubscription, savePushSubscription, sendTestPush, updateQuietHours } from "@/lib/push.functions";
import { VAPID_PUBLIC_KEY } from "@/lib/push-config";
import { conversationsQuery } from "@/lib/tess-queries";
import { DIFFICULTIES, type Difficulty } from "@/lib/tess-logic";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Settings — Chats" },
      { name: "description", content: "Appearance, notifications and simulation options." },
      { property: "og:title", content: "Settings — Chats" },
      { property: "og:description", content: "Appearance, notifications and simulation options." },
    ],
  }),
  component: SettingsPage,
});

const DIFF_COPY: Record<Difficulty, string> = {
  easy: "Receptive and clear",
  realistic: "Mixed energy, normal ambiguity",
  ambiguous: "Likes the attention, unsure about romance",
  guarded: "Slow trust; early escalation backfires",
  chaos: "Life gets in the way, moods shift",
};

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex min-h-13 items-center justify-between gap-4 px-4 py-3 text-[15px]", className)}>{children}</div>;
}

function SettingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const convs = useQuery(conversationsQuery);
  const update = useServerFn(updateSettings);
  const reset = useServerFn(resetRelationship);
  const wipe = useServerFn(deleteAllData);
  const list = convs.data ?? [];
  const tessConv = list.find((c) => (c.character as { key?: string } | null)?.key === "tess");
  const anyConv = list[0];

  async function set(patch: { conversationId?: string; photo_frequency?: "rare" | "normal" | "frequent"; difficulty?: Difficulty; typing_indicator?: boolean; read_receipts?: boolean; show_sim_data?: boolean; real_time_mode?: boolean }) {
    await update({ data: patch });
    qc.invalidateQueries({ queryKey: ["conversations"] });
    qc.invalidateQueries({ queryKey: ["conversation"] });
  }

  async function exportConvo() {
    if (!tessConv) return;
    const { data } = await supabase.from("messages").select("sender, body, created_at").eq("conversation_id", tessConv.id).lte("visible_at", new Date().toISOString()).order("created_at");
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), messages: data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tess-conversation.json";
    a.click();
  }

  async function doReset() {
    if (!tessConv) return;
    await reset({ data: { conversationId: tessConv.id } });
    qc.clear();
    toast.success("Fresh start with Tess. You just met at trivia.");
    navigate({ to: "/inbox" });
  }
  async function doWipe() {
    await wipe();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <>
      <ScreenHeader title="Settings" />
      <Screen>
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">General</h3>
        <div className="mt-2 divide-y rounded-2xl bg-surface">
          <NotificationsRow />
          <QuietHoursRow />
          <MessagePreviewsRow />
          <Row>
            Typing indicator
            <Switch checked={!!anyConv?.typing_indicator} onCheckedChange={(v) => set({ typing_indicator: v })} />
          </Row>
          <Row>
            Read receipts
            <Switch checked={!!anyConv?.read_receipts} onCheckedChange={(v) => set({ read_receipts: v })} />
          </Row>
        </div>

        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Simulation</h3>
        <div className="mt-2 divide-y rounded-2xl bg-surface">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-4 text-[15px]">
              Real-Time Mode
              <Switch checked={!!anyConv?.real_time_mode} onCheckedChange={(v) => set({ real_time_mode: v })} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Contacts follow their fictional daily schedules. Replies may take longer.</p>
          </div>
          <Row>
            Show simulation data
            <Switch checked={!!anyConv?.show_sim_data} onCheckedChange={(v) => set({ show_sim_data: v })} />
          </Row>
        </div>

        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Difficulty</h3>
        <div className="mt-2 divide-y rounded-2xl bg-surface">
          {DIFFICULTIES.map((d) => (
            <button key={d} type="button" onClick={() => set({ difficulty: d })} className="flex w-full items-center justify-between px-4 py-3 text-left">
              <span>
                <span className="block text-[15px] font-medium capitalize">{d}</span>
                <span className="block text-xs text-muted-foreground">{DIFF_COPY[d]}</span>
              </span>
              <span className={cn("h-4 w-4 rounded-full border-2", (anyConv?.difficulty ?? "realistic") === d ? "border-primary bg-primary" : "border-border")} />
            </button>
          ))}
        </div>

        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tess</h3>
        <div className="mt-2 rounded-2xl bg-surface">
          <div className="px-4 py-3">
            <div className="text-[15px]">Photo frequency</div>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-background p-1">
              {(["rare", "normal", "frequent"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => set({ photo_frequency: f })}
                  className={cn("rounded-lg py-2 text-sm font-medium capitalize", (tessConv?.photo_frequency ?? "normal") === f ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                >
                  {f}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Only nudges how often. She still decides based on mood and how well you know each other.</p>
          </div>
          <div className="border-t">
            <button type="button" onClick={exportConvo} className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px]">
              Export Tess conversation <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">About</h3>
        <div className="mt-2 divide-y rounded-2xl bg-surface">
          <div className="px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            Every contact in Chats is a fictional, AI-generated character. Conversations are generated by AI and designed
            for interpersonal and texting practice. Nothing here is a real person, and no real contact data is used.
          </div>
          <Link to="/" className="flex items-center justify-between px-4 py-3 text-[15px]">
            Replay the intro <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>

        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Start over</h3>
        <div className="mt-2 divide-y rounded-2xl bg-surface">
          <Confirm title="Reset Tess?" body="Your history with Tess is erased and you're back to the night you met at trivia. Other contacts are untouched." action="Reset" onConfirm={doReset}>
            <button type="button" className="w-full px-4 py-3 text-left text-[15px]">Reset Tess / new scenario</button>
          </Confirm>
          <Confirm title="Delete all data?" body="Every conversation, debrief and all simulation data is permanently deleted, and you'll be signed out." action="Delete" onConfirm={doWipe}>
            <button type="button" className="w-full px-4 py-3 text-left text-[15px] text-destructive">Delete all simulation data</button>
          </Confirm>
          <button type="button" onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/" }))} className="w-full px-4 py-3 text-left text-[15px]">
            Sign out
          </button>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">All contacts are fictional.</p>
      </Screen>
    </>
  );
}

function b64ToBytes(b64u: string): Uint8Array {
  const b64 = b64u.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Background push: real Web Push subscription for this device. Permission is
 * requested only when the user explicitly turns this on. Requires the installed
 * PWA / published site (service workers don't register in the editor preview).
 */
function NotificationsRow() {
  const qc = useQueryClient();
  const save = useServerFn(savePushSubscription);
  const remove = useServerFn(removePushSubscription);
  const test = useServerFn(sendTestPush);
  const statusFn = useServerFn(pushStatus);
  const status = useQuery({ queryKey: ["pushStatus"], queryFn: () => statusFn() });
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState(() => (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"));
  const [localEndpoint, setLocalEndpoint] = useState<string | null>(null);
  const subs = status.data?.subscriptions ?? [];
  // On = this device holds a push-worker subscription the server also knows about.
  const enabled = localEndpoint ? subs.some((s) => s.endpoint === localEndpoint) : false;

  useEffect(() => {
    void findPushRegistration()
      .then((r) => r?.pushManager?.getSubscription())
      .then((s) => setLocalEndpoint(s?.endpoint ?? null))
      .catch(() => setLocalEndpoint(null));
  }, []);

  /** Drop every subscription on this device (old /sw.js ones and ones made with an old key). */
  async function clearLocal() {
    for (const s of await allLocalSubscriptions()) {
      await remove({ data: { endpoint: s.endpoint } }).catch(() => undefined);
      await s.unsubscribe().catch(() => undefined);
    }
    setLocalEndpoint(null);
  }

  async function toggle(v: boolean) {
    setBusy(true);
    try {
      if (v) {
        if (!("Notification" in window)) throw new Error("This browser doesn't support background notifications.");
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== "granted") throw new Error("Notifications weren't allowed. You can change this in your phone's settings.");
        const reg = await getPushRegistration();
        if (!reg.pushManager) throw new Error("This browser doesn't support background notifications.");
        await clearLocal(); // always start fresh so a stale key can't block subscribing
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) as BufferSource });
        const json = sub.toJSON();
        await save({ data: { endpoint: sub.endpoint, keys: { p256dh: json.keys!["p256dh"], auth: json.keys!["auth"] }, userAgent: navigator.userAgent } });
        setLocalEndpoint(sub.endpoint);
        localStorage.setItem("tess:notifications", "on"); // foreground toasts while the app is open
        toast.success("Background notifications on for this device.");
      } else {
        await clearLocal();
        localStorage.setItem("tess:notifications", "off");
        toast.success("Background notifications off for this device.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change notifications.");
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["pushStatus"] });
    }
  }

  /** Full reset: forget every device registered to this account plus this device's subscriptions. */
  async function resetAll() {
    setBusy(true);
    try {
      await clearLocal();
      for (const s of subs) await remove({ data: { endpoint: s.endpoint } }).catch(() => undefined);
      toast.success("Notifications reset. Turn the switch on to register this device again.");
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["pushStatus"] });
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const r = await test({});
      if (r.sent > 0) toast.success(`Test notification sent to ${r.sent} device(s).`);
      else toast.error(`Not delivered${r.failures.length ? `: ${r.failures[0]}` : "."}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-4 text-[15px]">
        Background notifications
        <Switch checked={enabled} disabled={busy} onCheckedChange={toggle} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Real push notifications when a contact texts while the app is closed. Only actual messages — never engagement bait.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Status: {permission === "unsupported" ? "unsupported browser" : `permission ${permission}`} · {subs.length} device(s) subscribed
        {localEndpoint && !enabled ? " · this device needs re-registering" : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {enabled && (
          <button type="button" disabled={busy} onClick={sendTest} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            Send test notification
          </button>
        )}
        {(
          <button type="button" disabled={busy} onClick={resetAll} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50">
            Reset notifications
          </button>
        )}
      </div>
    </div>
  );
}

/** Global quiet hours: no pushes between start and end (Eastern time). */
function QuietHoursRow() {
  const qc = useQueryClient();
  const load = useServerFn(quietHours);
  const save = useServerFn(updateQuietHours);
  const q = useQuery({ queryKey: ["quietHours"], queryFn: () => load() });
  const start = q.data?.quietStart ?? null;
  const end = q.data?.quietEnd ?? null;

  async function setHours(s: number | null, e: number | null) {
    await save({ data: { quietStart: s, quietEnd: e } });
    qc.invalidateQueries({ queryKey: ["quietHours"] });
  }

  const HourSelect = ({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) => (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {label}
      <select
        className="rounded-md border bg-background px-2 py-1 text-sm text-foreground"
        value={value === null ? "off" : String(value)}
        onChange={(e) => onChange(e.target.value === "off" ? null : Number(e.target.value))}
      >
        <option value="off">Off</option>
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="px-4 py-3">
      <div className="text-[15px]">Quiet hours</div>
      <div className="mt-2 flex items-center gap-4">
        <HourSelect label="From" value={start} onChange={(v) => setHours(v, v === null ? null : (end ?? 7))} />
        <HourSelect label="Until" value={end} onChange={(v) => setHours(v === null ? null : (start ?? 23), v)} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">No notifications between these hours (Eastern time). Messages still arrive silently.</p>
    </div>
  );
}

function MessagePreviewsRow() {
  const [previews, setPreviews] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("tess:messagePreviews") !== "off" : true));
  function toggle(v: boolean) {
    localStorage.setItem("tess:messagePreviews", v ? "on" : "off");
    setPreviews(v);
  }
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-4 text-[15px]">
        Message previews in notifications
        <Switch checked={previews} onCheckedChange={toggle} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Off: notifications just say "New message".</p>
    </div>
  );
}

function Confirm({ title, body, action, onConfirm, children }: { title: string; body: string; action: string; onConfirm: () => void; children: React.ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
