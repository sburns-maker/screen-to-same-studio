import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ClipboardList, Settings } from "lucide-react";
import { toast } from "sonner";
import tessImg from "@/assets/tess.jpg";
import { supabase } from "@/integrations/supabase/client";
import { ensureConversation, tessMaybeInitiate, tessRespond } from "@/lib/tess.functions";
import { conversationQuery, messagesQuery, userTz } from "@/lib/tess-queries";
import { cn } from "@/lib/utils";
import { PHOTO_SRC } from "@/lib/tess-photo-images";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Tess" },
      { name: "description", content: "Your conversation with Tess." },
      { property: "og:title", content: "Tess" },
      { property: "og:description", content: "Your conversation with Tess." },
    ],
  }),
  component: Chat,
});

// ---- Offline outbox: messages sent without connectivity wait here. ----
type QueuedMsg = { id: string; body: string; at: number };
const QUEUE_KEY = "tess:outbox";
function readQueue(): QueuedMsg[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedMsg[];
  } catch {
    return [];
  }
}
function writeQueue(q: QueuedMsg[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function fmtDivider(d: Date) {
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `Today ${fmtTime(d)}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday ${fmtTime(d)}`;
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) + ` ${fmtTime(d)}`;
}

function Chat() {
  const qc = useQueryClient();
  const ensure = useServerFn(ensureConversation);
  const respond = useServerFn(tessRespond);
  const initiate = useServerFn(tessMaybeInitiate);

  const ensured = useQuery({ queryKey: ["ensure"], queryFn: () => ensure(), staleTime: Infinity });
  const conv = useQuery({ ...conversationQuery, enabled: ensured.isSuccess });
  const convId = conv.data?.id;
  const msgs = useQuery(messagesQuery(convId));

  const [now, setNow] = useState(() => Date.now());
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [queue, setQueue] = useState<QueuedMsg[]>(() => readQueue());
  const [online, setOnline] = useState(() => navigator.onLine);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const all = msgs.data ?? [];
  const visible = all.filter((m) => new Date(m.visible_at).getTime() <= now);
  const pending = all.filter((m) => new Date(m.visible_at).getTime() > now);

  // Tick while replies are pending.
  useEffect(() => {
    if (!pending.length) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [pending.length]);

  const refetch = useCallback(() => qc.invalidateQueries({ queryKey: ["messages", convId] }), [qc, convId]);

  const runRespond = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    setThinking(true);
    try {
      await respond({ data: { tz: userTz() } });
      await refetch();
      setNow(Date.now());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tess couldn't reply right now");
    } finally {
      inFlight.current = false;
      setThinking(false);
      if (again.current) {
        again.current = false;
        void runRespond();
      }
    }
  }, [respond, refetch]);

  // One-time check whether Tess texts first after a long gap.
  const initiated = useRef(false);
  useEffect(() => {
    if (!msgs.isSuccess || initiated.current) return;
    initiated.current = true;
    initiate({ data: { tz: userTz() } })
      .then((r) => {
        if (r.count) void refetch();
      })
      .catch(() => {});
  }, [msgs.isSuccess, initiate, refetch]);

  async function send() {
    const body = text.trim();
    if (!body || !convId) return;
    setText("");
    if (!navigator.onLine) {
      // Offline: queue locally, send when connectivity returns. No fake reply.
      const q = [...readQueue(), { id: crypto.randomUUID(), body, at: Date.now() }];
      writeQueue(q);
      setQueue(q);
      taRef.current?.focus();
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("messages").insert({ conversation_id: convId, user_id: u.user!.id, sender: "user", body });
    if (error) {
      toast.error("Message didn't send");
      setText(body);
      return;
    }
    setNow(Date.now());
    await refetch();
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void runRespond(), 2500);
    taRef.current?.focus();
  }

  // Connectivity: flush the outbox when we're back online, then let Tess respond.
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!online || !convId || !queue.length) return;
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const pendingOut = readQueue();
      for (const m of pendingOut) {
        const { error } = await supabase
          .from("messages")
          .insert({ conversation_id: convId, user_id: u.user.id, sender: "user", body: m.body });
        if (error) return; // still failing — keep the queue intact
        writeQueue(readQueue().filter((x) => x.id !== m.id));
      }
      setQueue(readQueue());
      await refetch();
      debounce.current = setTimeout(() => void runRespond(), 1500);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, convId]);

  // Notifications: only real message events, only when explicitly enabled.
  const lastSeenTess = useRef<string | null>(null);
  useEffect(() => {
    const tessMsgs = visible.filter((m) => m.sender === "tess");
    const latest = tessMsgs[tessMsgs.length - 1];
    if (!latest) return;
    if (lastSeenTess.current === null) {
      lastSeenTess.current = latest.id;
      return;
    }
    if (latest.id === lastSeenTess.current) return;
    lastSeenTess.current = latest.id;
    if (localStorage.getItem("tess:notifications") !== "on") return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!document.hidden) return;
    const md = latest.metadata as { photo?: string; generated_path?: string } | null;
    const body = latest.body?.trim() || (md?.photo || md?.generated_path ? "Sent a photo" : "Sent a message");
    try {
      new Notification("Tess", { body: body.slice(0, 140), icon: "/icon-512.png", tag: "tess-message" });
    } catch {
      /* some platforms require SW-based notifications */
    }
  }, [visible]);

  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [visible.length, pending.length]);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }, [text]);

  const nextPending = pending[0];
  const showTyping = useMemo(() => {
    if (!conv.data?.typing_indicator || !nextPending) return false;
    const left = new Date(nextPending.visible_at).getTime() - now;
    return left <= Math.min(9000, 1800 + nextPending.body.length * 90);
  }, [conv.data?.typing_indicator, nextPending, now]);

  const lastUserIdx = visible.map((m) => m.sender).lastIndexOf("user");
  const readReceipt = (() => {
    if (!conv.data?.read_receipts || lastUserIdx < 0 || lastUserIdx !== visible.length - 1) return null;
    return thinking || pending.length ? "Read" : "Delivered";
  })();

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="pt-safe z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-3">
          <Link to="/profile" className="flex flex-1 items-center gap-3" aria-label="Tess's profile">
            <img src={tessImg} alt="" width={512} height={512} className="h-9 w-9 rounded-full object-cover" />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold">Tess</div>
              <div className="text-xs text-muted-foreground">{showTyping ? "typing…" : "Tap for info"}</div>
            </div>
          </Link>
          <Link to="/debrief" aria-label="Debrief" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted">
            <ClipboardList className="h-5 w-5" />
          </Link>
          <Link to="/settings" aria-label="Settings" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted">
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col px-3 py-4">
          {msgs.isLoading || ensured.isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : null}
          {visible.map((m, i) => {
            const prev = visible[i - 1];
            const next = visible[i + 1];
            const t = new Date(m.created_at);
            const gap = !prev || t.getTime() - new Date(prev.created_at).getTime() > 45 * 60_000;
            const mine = m.sender === "user";
            const groupedNext = next && next.sender === m.sender && new Date(next.created_at).getTime() - t.getTime() < 5 * 60_000;
            return (
              <div key={m.id}>
                {gap && <div className="my-3 text-center text-[11px] font-medium text-muted-foreground">{fmtDivider(t)}</div>}
                <div className={cn("flex", mine ? "justify-end" : "justify-start", groupedNext ? "mb-0.5" : "mb-2")}>
                  <div className={cn("flex max-w-[78%] flex-col gap-0.5", mine ? "items-end" : "items-start")}>
                  {(() => {
                    const md = m.metadata as { photo?: string; generated_path?: string } | null;
                    const src = md?.photo ? PHOTO_SRC[md.photo] : undefined;
                    if (src)
                      return <img src={src} alt="Photo from Tess" loading="lazy" width={640} height={853} className="bubble-in w-60 rounded-2xl rounded-bl-md object-cover" />;
                    if (md?.generated_path) return <GeneratedPhoto path={md.generated_path} />;
                    return null;
                  })()}
                  {m.body && <div
                    title={fmtTime(t)}
                    className={cn(
                      "bubble-in whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-snug",
                      mine ? "rounded-2xl rounded-br-md bg-bubble-me text-bubble-me-foreground" : "rounded-2xl rounded-bl-md bg-bubble-them text-bubble-them-foreground",
                    )}
                  >
                    {m.body}
                  </div>}
                  </div>
                </div>
                {i === lastUserIdx && readReceipt && (
                  <div className="-mt-1 mb-2 pr-1 text-right text-[11px] text-muted-foreground">{readReceipt}</div>
                )}
              </div>
            );
          })}
          {queue.map((q) => (
            <div key={q.id} className="mb-2 flex justify-end">
              <div className="flex max-w-[78%] flex-col items-end gap-0.5">
                <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-bubble-me px-3.5 py-2 text-[15px] leading-snug text-bubble-me-foreground opacity-70">
                  {q.body}
                </div>
                <div className="pr-1 text-[11px] text-muted-foreground">Queued — sends when you're back online</div>
              </div>
            </div>
          ))}
          {showTyping && (
            <div className="mb-2 flex">
              <div className="flex gap-1 rounded-2xl rounded-bl-md bg-bubble-them px-4 py-3" aria-label="Tess is typing">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="typing-dot h-2 w-2 rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="pb-safe border-t bg-background"
      >
        <div className="mx-auto flex max-w-xl items-end gap-2 px-3 pt-2">
          <textarea
            ref={taRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Text message"
            className="max-h-36 min-h-10 flex-1 resize-none rounded-3xl border bg-surface px-4 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}

function GeneratedPhoto({ path }: { path: string }) {
  const q = useQuery({
    queryKey: ["photo-url", path],
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("tess-photos").createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  const [failed, setFailed] = useState(false);
  if (failed || q.isError) return null;
  if (!q.data) return <div className="h-80 w-60 animate-pulse rounded-2xl rounded-bl-md bg-bubble-them" />;
  return (
    <img
      src={q.data}
      alt="Photo from Tess"
      loading="lazy"
      width={1024}
      height={1536}
      onError={() => setFailed(true)}
      className="bubble-in w-60 rounded-2xl rounded-bl-md object-cover"
    />
  );
}
