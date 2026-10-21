import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { MoreVertical, Search, Settings } from "lucide-react";
import { ensureConversations, inboxOverview, tessMaybeInitiate } from "@/lib/tess.functions";
import { userTz } from "@/lib/tess-queries";
import { characterFor } from "@/lib/characters";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Chats" },
      { name: "description", content: "Your conversations." },
      { property: "og:title", content: "Chats" },
      { property: "og:description", content: "Your conversations." },
    ],
  }),
  component: Inbox,
});

function fmtTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function Inbox() {
  const ensure = useServerFn(ensureConversations);
  const initiate = useServerFn(tessMaybeInitiate);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const ensured = useQuery({ queryKey: ["ensure"], queryFn: () => ensure(), staleTime: Infinity });
  const inbox = useQuery({
    queryKey: ["inbox"],
    queryFn: () => useServerFnInline(),
    enabled: ensured.isSuccess,
    refetchInterval: 30_000,
  });

  // useServerFn must be called at top level; wrap inboxOverview once.
  function useServerFnInline() {
    return inboxFn({ data: undefined as never });
  }
  const inboxFn = useServerFn(inboxOverview);

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

  const rows = (inbox.data ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.preview.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="pt-safe sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-1 px-3">
          <h1 className="flex-1 px-1 text-xl font-semibold">Chats</h1>
          <button
            type="button"
            aria-label="Search"
            onClick={() => setSearchOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
          >
            <Search className="h-5 w-5" />
          </button>
          <Link to="/settings" aria-label="Settings" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted">
            <MoreVertical className="h-5 w-5" />
          </Link>
        </div>
        {searchOpen && (
          <div className="mx-auto max-w-xl px-3 pb-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search conversations"
              className="h-10 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-xl flex-1">
        {inbox.isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
        <ul className="divide-y">
          {rows.map((r) => {
            const def = characterFor(r.characterKey);
            return (
              <li key={r.id}>
                <Link to="/chat/$conversationId" params={{ conversationId: r.id }} className="flex items-center gap-3 px-4 py-3 active:bg-muted/60">
                  <img src={def.avatar} alt="" width={1024} height={1024} className="h-13 w-13 shrink-0 rounded-full object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-[15px]", r.unread > 0 ? "font-semibold" : "font-medium")}>{r.name}</span>
                      <span className={cn("shrink-0 text-xs", r.unread > 0 ? "font-semibold text-primary" : "text-muted-foreground")}>{fmtTime(r.lastAt)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={cn("truncate text-sm", r.unread > 0 ? "text-foreground" : "text-muted-foreground")}>{r.preview || " "}</span>
                      {r.unread > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{r.unread}</span>}
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
