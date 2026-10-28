import { usePortraits } from "@/lib/use-portrait";
import { useTown } from "@/lib/town-queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Search, Phone } from "lucide-react";
import { ensureConversations, inboxOverview, tessMaybeInitiate } from "@/lib/tess.functions";
import { userTz } from "@/lib/tess-queries";
import { characterFor } from "@/lib/characters";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Inbox — Chats" },
      { name: "description", content: "Your conversations." },
      { property: "og:title", content: "Inbox — Chats" },
      { property: "og:description", content: "Your conversations." },
    ],
  }),
  component: Inbox,
});

function fmtTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function Inbox() {
  const portraits=usePortraits();
  const town = useTown();
  const ensure = useServerFn(ensureConversations);
  const initiate = useServerFn(tessMaybeInitiate);
  const inboxFn = useServerFn(inboxOverview);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const ensured = useQuery({ queryKey: ["ensure"], queryFn: () => ensure(), staleTime: Infinity });
  const inbox = useQuery({
    queryKey: ["inbox"],
    queryFn: () => inboxFn({}),
    enabled: ensured.isSuccess,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // On opening the app, give each contact one chance to text first.
  useEffect(() => {
    if (!ensured.isSuccess) return;
    initiate({ data: { tz: userTz() } })
      .then((r) => {
        if (r.count) inbox.refetch();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensured.isSuccess]);

  const rows = (inbox.data ?? []).filter(
    (r) =>
      !q ||
      r.name.toLowerCase().includes(q.toLowerCase()) ||
      r.preview.toLowerCase().includes(q.toLowerCase()),
  );

  const townContacts = (town.data?.people ?? []).filter(p => p.connection?.contact &&
    (!q || p.name.toLowerCase().includes(q.toLowerCase()) ||
      town.data?.messages.some(m => m.npc_key === p.key && m.text.toLowerCase().includes(q.toLowerCase()))));

  // Optional Android launcher bridge: existing authenticated server functions remain
  // the source of truth. No database credentials or contact data cross this boundary.
  useEffect(() => {
    if (!inbox.isSuccess) return;
    // Android checks this marker only after the authenticated inbox has loaded.
    // The marker carries no credentials; conversation data stays in the app bridge.
    (window as Window & { __livingWorldInboxBridgeReady?: boolean })
      .__livingWorldInboxBridgeReady = true;
    const bridge = (window as Window & {
      LivingWorldAndroid?: { receiveInbox?: (json: string) => void };
    }).LivingWorldAndroid;
    if (!bridge?.receiveInbox) return;
    const payload = (inbox.data ?? []).map((r) => {
      const def = characterFor(r.characterKey);
      return {
        id: r.id,
        key: def.key,
        name: r.name,
        preview: r.preview ?? "",
        lastAt: r.lastAt,
        unread: r.unread,
        photo: portraits.data?.[def.key] ?? def.avatar,
      };
    });
    bridge.receiveInbox(JSON.stringify(payload));
  }, [inbox.isSuccess, inbox.data, portraits.isSuccess, portraits.data]);

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col bg-background pb-6">
      <header className="pt-safe sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-1 px-3">
          <h1 className="flex-1 px-1 text-xl font-semibold">Chats</h1>
          <Link to="/calls" aria-label="Calls and recents" className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><Phone className="h-5 w-5" /></Link>
          <button
            type="button"
            aria-label="Search"
            aria-expanded={searchOpen}
            aria-controls="chat-search"
            onClick={() => setSearchOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>
        {searchOpen && (
          <div className="mx-auto max-w-xl px-3 pb-2">
            <input
              autoFocus
              id="chat-search"
              aria-label="Search conversations"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search conversations"
              className="h-11 w-full rounded-2xl border bg-surface px-3 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-xl flex-1">
        {(ensured.isPending || inbox.isLoading) && <div role="status" aria-label="Loading conversations" className="space-y-5 px-4 py-5">
          {[0,1,2,3].map(i => <div key={i} className="flex items-center gap-3 motion-safe:animate-pulse" aria-hidden="true"><div className="size-13 shrink-0 rounded-full bg-muted"/><div className="flex-1 space-y-2"><div className="h-3 w-24 rounded-full bg-muted"/><div className="h-3 w-4/5 rounded-full bg-muted"/></div></div>)}
          <span className="sr-only">Opening your conversations…</span>
        </div>}
        {(ensured.isError || inbox.isError) && <div role="alert" className="m-4 rounded-2xl border bg-card p-4 text-sm">
          Conversations couldn’t refresh. Your saved messages are unchanged.
          <button type="button" className="mt-2 block min-h-11 text-primary underline" onClick={() => void (ensured.isError ? ensured.refetch() : inbox.refetch())}>Try again</button>
        </div>}
        {q && !rows.length && !townContacts.length && <p role="status" className="px-4 py-10 text-center text-sm text-muted-foreground">No matching conversations. Try another name or phrase.</p>}
        <ul className="divide-y divide-border/50">
          {townContacts.map((p) => {
              const latest = town.data?.messages.find((m) => m.npc_key === p.key);
              const unread = (town.data?.messages ?? []).filter(
                (m) =>
                  m.npc_key === p.key &&
                  m.role === "assistant" &&
                  m.created_at > (p.connection?.read_at ?? ""),
              ).length;
              return (
                <li key={p.key}>
                  <Link
                    to="/encounter/$npcKey"
                    params={{ npcKey: p.key }}
                    className="flex items-center gap-3 px-4 py-3 active:bg-muted/60"
                  >
                    <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-2xl">
                      {p.name[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between">
                        <span className={unread ? "font-semibold" : "font-medium"}>{p.name}</span>
                        {unread > 0 && (
                          <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">
                            {unread}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {latest?.text ?? "Contact exchanged"}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          {rows.map((r) => {
            const def = characterFor(r.characterKey);
            return (
              <li key={r.id}>
                <Link
                  to="/chat/$conversationId"
                  params={{ conversationId: r.id }}
                  className="flex items-center gap-3 px-4 py-3 active:bg-muted/60"
                >
                  <img
                    src={portraits.data?.[def.key]??def.avatar}
                    alt=""
                    width={1024}
                    height={1024}
                    className="h-13 w-13 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-[15px]",
                          r.unread > 0 ? "font-semibold" : "font-medium",
                        )}
                      >
                        {r.name}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs",
                          r.unread > 0 ? "font-semibold text-primary" : "text-muted-foreground",
                        )}
                      >
                        {fmtTime(r.lastAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          r.unread > 0 ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {r.preview || " "}
                      </span>
                      {r.unread > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                          {r.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
