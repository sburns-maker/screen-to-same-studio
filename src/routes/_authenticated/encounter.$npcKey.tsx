import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTown } from "@/lib/town-queries";
import { actInTown } from "@/lib/town.functions";
import { ScreenHeader } from "@/components/ScreenHeader";
export const Route = createFileRoute("/_authenticated/encounter/$npcKey")({
  head: () => ({ meta: [
    { title: "Encounter \u00b7 AI Town" },
    { name: "description", content: "Your private fictional encounter conversation in AI Town." },
    { property: "og:title", content: "Encounter \u00b7 AI Town" },
    { property: "og:description", content: "Your private fictional encounter conversation in AI Town." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }), component: Encounter });
function Encounter() {
  const { npcKey } = Route.useParams(),
    q = useTown(),
    act = useServerFn(actInTown),
    cache = useQueryClient(),
    [text, setText] = useState(""),
    [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const person = q.data?.people.find((n) => n.key === npcKey),
    contact = !!person?.connection?.contact,
    mode = contact ? "message" : "scene";
  const messages =
    q.data?.messages
      .filter((m) => m.npc_key === npcKey)
      .slice()
      .reverse() ?? [];
  const readAt = person?.connection?.read_at;
  useEffect(() => {
    if (readAt)
      void act({ data: { action: "read", id: crypto.randomUUID(), npc: npcKey } }).catch(() => {});
  }, [act, npcKey, readAt]);
  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const r = await act({ data: { action: "speak", id: requestId, npc: npcKey, text, mode } });
      if (r.status !== "completed")
        toast.message(
          r.status === "reserved"
            ? "This attempt is already being processed. Refresh before sending again."
            : "This attempt ended without a reply. Edit your message to start a new attempt.",
        );
      else {
        setText("");
        setRequestId(crypto.randomUUID());
      }
      await cache.invalidateQueries({ queryKey: ["town"] });
    } catch (e) {
      setFailed(true);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exchange() {
    setBusy(true);
    try {
      await act({ data: { action: "contact", id: crypto.randomUUID(), npc: npcKey } });
      await cache.invalidateQueries({ queryKey: ["town"] });
      toast.success("Contact exchanged. You can find them in Messages.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-xl flex-col">
      <ScreenHeader
        title={person?.name ?? "Conversation"}
        backTo={contact ? "/inbox" : "/explore"}
      />
      <p className="border-b px-4 py-3 text-xs text-muted-foreground">
        {contact ? "Private messages · Fictional contact" : "In-person scene · Virtual encounter"} ·
        No photo generation is available for new contacts yet.
      </p>
      {q.error && (
        <p role="alert" className="p-4">
          {q.error.message}
        </p>
      )}
      <main className="flex-1 space-y-3 px-4 py-5">
        {person && !messages.length && (
          <div className="rounded-3xl bg-surface p-5 text-sm">
            <p className="mb-2 font-medium">
              {person.name}, {person.age}
            </p>
            <p>{person.blurb}</p>
            <p className="mt-3 text-muted-foreground">
              Say something natural. Contact exchange is optional and does not imply romance.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-[15px] ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-surface"}`}
            >
              {m.text}
            </p>
          </div>
        ))}
        {busy && (
          <p role="status" className="text-sm text-muted-foreground">
            One moment…
          </p>
        )}
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            The attempt failed. Refresh to check delivery before starting another attempt. Images
            are never generated here.
          </p>
        )}
      </main>
      {person?.connection?.contact_offered && !contact && (
        <div className="mx-4 mb-3 rounded-2xl border p-4 text-sm">
          <p>They are open to staying in touch. Exchange contact details?</p>
          <button
            disabled={busy}
            onClick={exchange}
            className="mt-3 rounded-full bg-primary px-4 py-2 text-primary-foreground"
          >
            Exchange contacts
          </button>
        </div>
      )}
      {contact && q.data?.expansion && (
        <label className="mx-4 mb-3 flex items-start gap-2 rounded-xl border p-3 text-xs">
          <input
            type="checkbox"
            checked={person?.connection?.followups_enabled ?? false}
            disabled={busy}
            onChange={async (e) => {
              try {
                await act({
                  data: {
                    action: "followups",
                    id: crypto.randomUUID(),
                    npc: npcKey,
                    enabled: e.target.checked,
                  },
                });
                await cache.invalidateQueries({ queryKey: ["town"] });
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          />
          Allow occasional follow-ups grounded in this conversation.{" "}
          {q.data.npcFollowupsConfigured
            ? "Background follow-ups are configured."
            : "Background follow-ups are currently disabled on this server."}
        </label>
      )}
      {!contact && !person?.present && (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          They are not available in this scene.{" "}
          <Link to="/explore" className="underline">
            Explore
          </Link>
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="sticky bottom-0 flex gap-2 border-t bg-background p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]"
      >
        <input
          aria-label="Message"
          value={text}
          disabled={busy}
          maxLength={1500}
          onChange={(e) => {
            setText(e.target.value);
            setRequestId(crypto.randomUUID());
            setFailed(false);
          }}
          placeholder={contact ? "Message" : "Say hello…"}
          className="min-w-0 flex-1 rounded-full border bg-surface px-4 py-3"
        />
        <button
          disabled={busy || !text.trim() || (!contact && !person?.present) || failed}
          className="rounded-full bg-primary px-5 text-primary-foreground disabled:opacity-40"
        >
          Send
        </button>
        {failed && (
          <button
            type="button"
            onClick={async () => {
              const fresh = await q.refetch();
              if (fresh.data?.messages.some((m) => m.action_id === requestId)) {
                setText("");
                setRequestId(crypto.randomUUID());
              }
              setFailed(false);
            }}
            className="text-xs underline"
          >
            Refresh
          </button>
        )}
      </form>
    </div>
  );
}
