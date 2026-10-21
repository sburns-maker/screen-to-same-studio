import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { conversationsQuery } from "@/lib/tess-queries";
import { DIFFICULTIES, type Difficulty } from "@/lib/tess-logic";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
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

/** Push notifications: permission is requested only when the user explicitly turns this on. */
function NotificationsRow() {
  const [enabled, setEnabled] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("tess:notifications") === "on" : false));
  async function toggle(v: boolean) {
    if (v) {
      if (!("Notification" in window)) {
        toast.error("This browser doesn't support notifications.");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Notifications weren't allowed. You can change this in your browser settings.");
        return;
      }
      localStorage.setItem("tess:notifications", "on");
      setEnabled(true);
      toast.success("Notifications on. You'll only be pinged when someone actually texts.");
    } else {
      localStorage.setItem("tess:notifications", "off");
      setEnabled(false);
    }
  }
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-4 text-[15px]">
        Notifications
        <Switch checked={enabled} onCheckedChange={toggle} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Only when a contact actually sends a message or photo. Never engagement bait.</p>
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
