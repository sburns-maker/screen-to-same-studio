import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { conversationQuery } from "@/lib/tess-queries";
import { DIFFICULTIES, type Difficulty } from "@/lib/tess-logic";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Tess" },
      { name: "description", content: "Difficulty, display options and your data." },
      { property: "og:title", content: "Settings — Tess" },
      { property: "og:description", content: "Difficulty, display options and your data." },
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
  const conv = useQuery(conversationQuery);
  const update = useServerFn(updateSettings);
  const reset = useServerFn(resetRelationship);
  const wipe = useServerFn(deleteAllData);
  const c = conv.data;

  async function set(patch: { photo_frequency?: "rare" | "normal" | "frequent"; difficulty?: Difficulty; typing_indicator?: boolean; read_receipts?: boolean; show_sim_data?: boolean; real_time_mode?: boolean }) {
    qc.setQueryData(conversationQuery.queryKey, (old: typeof c) => (old ? { ...old, ...patch } : old));
    await update({ data: patch });
    qc.invalidateQueries({ queryKey: ["conversation"] });
  }

  async function exportConvo() {
    if (!c) return;
    const { data } = await supabase.from("messages").select("sender, body, created_at").eq("conversation_id", c.id).lte("visible_at", new Date().toISOString()).order("created_at");
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), messages: data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tess-conversation.json";
    a.click();
  }

  async function doReset() {
    await reset();
    qc.clear();
    toast.success("Fresh start. You just met at trivia.");
    navigate({ to: "/chat" });
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
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Difficulty</h3>
        <div className="mt-2 divide-y rounded-2xl bg-surface">
          {DIFFICULTIES.map((d) => (
            <button key={d} type="button" onClick={() => set({ difficulty: d })} className="flex w-full items-center justify-between px-4 py-3 text-left">
              <span>
                <span className="block text-[15px] font-medium capitalize">{d}</span>
                <span className="block text-xs text-muted-foreground">{DIFF_COPY[d]}</span>
              </span>
              <span className={cn("h-4 w-4 rounded-full border-2", c?.difficulty === d ? "border-primary bg-primary" : "border-border")} />
            </button>
          ))}
        </div>

        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tess photo frequency</h3>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1">
          {(["rare", "normal", "frequent"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => set({ photo_frequency: f })}
              className={cn("rounded-xl py-2 text-sm font-medium capitalize", (c?.photo_frequency ?? "normal") === f ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {f}
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-xs text-muted-foreground">Only nudges how often. She still decides based on mood and how well you know each other.</p>

        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conversation</h3>
        <div className="mt-2 divide-y rounded-2xl bg-surface">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-4 text-[15px]">
              Real-Time Mode
              <Switch checked={!!c?.real_time_mode} onCheckedChange={(v) => set({ real_time_mode: v })} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Tess follows her fictional daily schedule. Replies may take longer.</p>
          </div>
          <NotificationsRow />
          <Row>
            Typing indicator
            <Switch checked={!!c?.typing_indicator} onCheckedChange={(v) => set({ typing_indicator: v })} />
          </Row>
          <Row>
            Read receipts
            <Switch checked={!!c?.read_receipts} onCheckedChange={(v) => set({ read_receipts: v })} />
          </Row>
          <Row>
            Show simulation data
            <Switch checked={!!c?.show_sim_data} onCheckedChange={(v) => set({ show_sim_data: v })} />
          </Row>
          {c?.show_sim_data && (
            <Link to="/debug" className="flex items-center justify-between px-4 py-3 text-[15px]">
              Simulation debug <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          )}
          <Link to="/history" className="flex items-center justify-between px-4 py-3 text-[15px]">
            Conversation history <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <button type="button" onClick={exportConvo} className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px]">
            Export conversation <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <h3 className="mt-8 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Start over</h3>
        <div className="mt-2 divide-y rounded-2xl bg-surface">
          <Confirm title="Reset relationship?" body="Everything with Tess is erased and you're back to the night you met at trivia." action="Reset" onConfirm={doReset}>
            <button type="button" className="w-full px-4 py-3 text-left text-[15px]">Reset relationship / new scenario</button>
          </Confirm>
          <Confirm title="Delete all data?" body="Your conversation, debriefs and simulation data are permanently deleted, and you'll be signed out." action="Delete" onConfirm={doWipe}>
            <button type="button" className="w-full px-4 py-3 text-left text-[15px] text-destructive">Delete all simulation data</button>
          </Confirm>
          <button type="button" onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/" }))} className="w-full px-4 py-3 text-left text-[15px]">
            Sign out
          </button>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">Tess is fictional. Real-time mode and notifications are coming later.</p>
      </Screen>
    </>
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
