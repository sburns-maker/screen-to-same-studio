import { ContactPending } from "@/components/ContactPending";
import { invalidateSchedule } from "@/lib/use-schedule";
import { CallButton } from "@/components/CallButton";
import { ConversationPlans } from "@/components/ConversationPlans";
import { ConversationMedia } from "@/components/ConversationMedia";
import { NpcIntroductionChip } from "@/components/NpcIntroductionChip";
import { usePortraits } from "@/lib/use-portrait";
import { PhotoViewer } from "@/components/PhotoViewer";
import { VideoAttachment } from "@/components/VideoAttachment";
import { VideoUploadButton } from "@/components/VideoUploadButton";
import { userVideoMetadata } from "@/lib/user-video";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Camera, ChevronLeft, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { markRead, tessRespond } from "@/lib/tess.functions";
import { conversationQuery, messagesQuery, userTz } from "@/lib/tess-queries";
import { characterFor } from "@/lib/characters";
import { cn } from "@/lib/utils";
import { PHOTO_SRC } from "@/lib/tess-photo-images";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/chat/$conversationId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Conversation — Chats" },
      { name: "description", content: "Conversation." },
      { property: "og:title", content: "Conversation — Chats" },
      { property: "og:description", content: "Conversation." },
    ],
  }),
  component: Chat,
});

// ---- Offline outbox: messages sent without connectivity wait here. ----
type QueuedMsg = { id: string; body: string; at: number };
const queueKey = (convId: string) => `tess:outbox:${convId}`;
function readQueue(convId: string): QueuedMsg[] {
  try {
    return JSON.parse(localStorage.getItem(queueKey(convId)) ?? "[]") as QueuedMsg[];
  } catch {
    return [];
  }
}
function writeQueue(convId: string, q: QueuedMsg[]) {
  localStorage.setItem(queueKey(convId), JSON.stringify(q));
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
  const portraits=usePortraits();
  const { conversationId } = Route.useParams();
  const qc = useQueryClient();
  const respond = useServerFn(tessRespond);
  const read = useServerFn(markRead);

  const conv = useQuery(conversationQuery(conversationId));
  const convId = conv.data?.id;
  const msgs = useQuery(messagesQuery(convId));
  const characterKey = (conv.data?.character as { key?: string } | null)?.key;
  const def = characterFor(characterKey);

  const [now, setNow] = useState(() => Date.now());
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [queue, setQueue] = useState<QueuedMsg[]>(() => readQueue(conversationId));
  const [online, setOnline] = useState(() => navigator.onLine);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // The Home Moments action prepares a one-use draft. It never sends a message
  // on navigation and never overwrites an actively edited composer.
  useEffect(() => {
    const key = "home-moment-draft:" + conversationId;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    sessionStorage.removeItem(key);
    try {
      const draft = JSON.parse(raw) as { text?: unknown };
      if (typeof draft.text === "string" && draft.text.trim().length > 0 && draft.text.length <= 500)
        setText(current => current.trim() ? current : draft.text as string);
    } catch {
      // Discard an invalid one-time draft rather than disturbing the chat.
    }
  }, [conversationId]);

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

  // Opening the thread marks it read.
  useEffect(() => {
    if (!convId) return;
    read({ data: { conversationId: convId } })
      .then(() => qc.invalidateQueries({ queryKey: ["inbox"] }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, visible.length]);

  const runRespond = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    setThinking(true);
    try {
      await respond({ data: { conversationId, tz: userTz() } });
      await refetch();
      await invalidateSchedule(qc);
      setNow(Date.now());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reply right now");
    } finally {
      inFlight.current = false;
      setThinking(false);
      if (again.current) {
        again.current = false;
        void runRespond();
      }
    }
  }, [respond, refetch, conversationId, qc]);

  // Opening a thread whose last message is the user's (unanswered) triggers a reply.
  const checkedOrphan = useRef(false);
  useEffect(() => {
    if (checkedOrphan.current || !msgs.data) return;
    checkedOrphan.current = true;
    const last = msgs.data[msgs.data.length - 1];
    if (last?.sender === "user" && Date.now() - new Date(last.created_at).getTime() > 5000) void runRespond();
  }, [msgs.data, runRespond]);

  // Leaving the thread before the debounce fires: send the reply request now.
  useEffect(
    () => () => {
      if (debounce.current) {
        clearTimeout(debounce.current);
        debounce.current = null;
        void respond({ data: { conversationId, tz: userTz() } }).catch(() => {});
      }
    },
    [respond, conversationId],
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function sendPhoto(file: File) {
    if (!convId || !file.type.startsWith("image/")) return;
    if (file.size > 10_000_000) { toast.error("Photo is too large"); return; }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${u.user!.id}/user/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("tess-photos").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const body = text.trim();
      setText("");
      const { error } = await supabase.from("messages").insert({ conversation_id: convId, user_id: u.user!.id, sender: "user", body, metadata: { user_photo: path } });
      if (error) throw error;
      setNow(Date.now());
      await refetch();
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => { debounce.current = null; void runRespond(); }, 2500);
    } catch {
      toast.error("Photo didn't send");
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || !convId) return;
    setText("");
    if (!navigator.onLine) {
      // Offline: queue locally, send when connectivity returns. No fake reply.
      const q = [...readQueue(conversationId), { id: crypto.randomUUID(), body, at: Date.now() }];
      writeQueue(conversationId, q);
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
    debounce.current = setTimeout(() => { debounce.current = null; void runRespond(); }, 2500);
    taRef.current?.focus();
  }

  // Connectivity: flush the outbox when we're back online, then let the contact respond.
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
      const pendingOut = readQueue(conversationId);
      for (const m of pendingOut) {
        const { error } = await supabase
          .from("messages")
          .insert({ conversation_id: convId, user_id: u.user.id, sender: "user", body: m.body });
        if (error) return; // still failing — keep the queue intact
        writeQueue(conversationId, readQueue(conversationId).filter((x) => x.id !== m.id));
      }
      setQueue(readQueue(conversationId));
      await refetch();
      debounce.current = setTimeout(() => { debounce.current = null; void runRespond(); }, 1500);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, convId]);

  // Notifications: only real message events, only when explicitly enabled.
  const lastSeenContact = useRef<string | null>(null);
  useEffect(() => {
    const contactMsgs = visible.filter((m) => m.sender === "tess");
    const latest = contactMsgs[contactMsgs.length - 1];
    if (!latest) return;
    if (lastSeenContact.current === null) {
      lastSeenContact.current = latest.id;
      return;
    }
    if (latest.id === lastSeenContact.current) return;
    lastSeenContact.current = latest.id;
    if (localStorage.getItem("tess:notifications") !== "on") return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!document.hidden) return;
    const md = latest.metadata as { photo?: string; generated_path?: string } | null;
    const previewsOff = localStorage.getItem("tess:messagePreviews") === "off";
    const body = previewsOff
      ? "New message"
      : latest.body?.trim() || (md?.photo || md?.generated_path ? "Sent a photo" : "Sent a message");
    try {
      new Notification(def.preferredName, { body: body.slice(0, 140), icon: "/icon-512.png", tag: `chats-${conversationId}` });
    } catch {
      /* some platforms require SW-based notifications */
    }
  }, [visible, def.preferredName, conversationId]);

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

  if (!characterKey) return <ContactPending conversationId={conversationId} failed={!!conv.error || !conv.isPending} retry={() => void conv.refetch()} />;

  return (
    <ConversationMedia messages={visible} character={def.key}><div className="flex h-dvh flex-col bg-background">
      <header className="pt-safe z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-1 px-2">
          <Link to="/inbox" aria-label="Back to Chats" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <Link
            to="/profile/$conversationId"
            params={{ conversationId }}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-1 pr-2"
            aria-label={`${def.preferredName}'s profile`}
          >
            <img src={portraits.data?.[def.key]??def.avatar} alt="" width={1024} height={1024} className="h-9 w-9 shrink-0 rounded-full object-cover" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[15px] font-semibold">{def.preferredName}</div>
              <div className="text-xs text-muted-foreground">{showTyping ? "typing…" : "Tap for contact info"}</div>
            </div>
          </Link>
          <CallButton conversationId={conversationId} name={def.preferredName}/>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Conversation options" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted">
                <MoreVertical className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link to="/profile/$conversationId" params={{ conversationId }}>View profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/games/$conversationId" params={{ conversationId }}>Games</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/calls" search={{ conversation: conversationId }}>Call history</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/history/$conversationId" params={{ conversationId }}>Search conversation</Link>
              </DropdownMenuItem>
              {(
                <DropdownMenuItem asChild>
                  <Link to="/photos/$conversationId" params={{ conversationId }}>Shared media</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link to="/settings">Conversation settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/debrief/$conversationId" params={{ conversationId }}>Practice tools</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/debug/$conversationId" params={{ conversationId }}>Simulation debug</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <ConversationPlans conversationId={conversationId}/>
      <div ref={scroller} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col px-3 py-4">
          {msgs.isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p> : null}
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
                    const video = userVideoMetadata(m.metadata);
                    if (video) return <VideoAttachment video={video} mediaId={m.id} />;
                    const md = m.metadata as { photo?: string; generated_path?: string; user_photo?: string } | null;
                    if (md?.user_photo) return <GeneratedPhoto path={md.user_photo} name="you" mediaId={m.id} />;
                    const src = md?.photo ? PHOTO_SRC[md.photo] : undefined;
                    if (src)
                      return <PhotoViewer src={src} mediaId={m.id} alt={`Photo from ${def.preferredName}`}><img src={src} alt={`Photo from ${def.preferredName}`} loading="lazy" width={640} height={853} className="bubble-in w-60 rounded-2xl rounded-bl-md object-cover" /></PhotoViewer>;
                    if (md?.generated_path) return <GeneratedPhoto path={md.generated_path} name={def.preferredName} mediaId={m.id} />;
                    return null;
                  })()}
                  {!mine&&<NpcIntroductionChip messageId={m.id} text={m.body}/>}
                  {m.body && <ReactionBubble
                    messageId={m.id}
                    conversationId={conversationId}
                    mine={mine}
                    timestamp={fmtTime(t)}
                    body={m.body}
                  />}
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
              <div className="flex gap-1 rounded-2xl rounded-bl-md bg-bubble-them px-4 py-3" aria-label={`${def.preferredName} is typing`}>
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
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void sendPhoto(f); }} />
          <button type="button" aria-label="Send a photo" disabled={uploading || !online} onClick={() => fileRef.current?.click()} className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-opacity disabled:opacity-30">
            <Camera className={cn("h-5 w-5", uploading && "animate-pulse")} />
          </button>
          {convId&&<VideoUploadButton conversationId={convId} caption={text.trim()} disabled={uploading||!online} onSent={async(caption,newlySent)=>{
            setText(current=>current.trim()===caption?"":current);setNow(Date.now());await refetch();
            if(newlySent){if(debounce.current)clearTimeout(debounce.current);debounce.current=setTimeout(()=>{debounce.current=null;void runRespond();},2500);}
          }}/>}
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
            placeholder={`Message ${def.preferredName}…`}
            className="max-h-36 min-h-10 min-w-0 flex-1 resize-none rounded-3xl border bg-surface px-4 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground focus:border-ring"
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
    </div></ConversationMedia>
  );
}

function GeneratedPhoto({ path, name, mediaId }: { path: string; name: string; mediaId?: string }) {
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
  if (failed || q.isError) return <button className="rounded-xl border p-3 text-sm" onClick={()=>{setFailed(false);void q.refetch();}}>Photo unavailable · Reload</button>;
  if (!q.data) return <div className="h-80 w-60 animate-pulse rounded-2xl rounded-bl-md bg-bubble-them" />;
  return (
    <PhotoViewer src={q.data} mediaId={mediaId} alt={`Photo from ${name}`}><img
      src={q.data}
      alt={`Photo from ${name}`}
      loading="lazy"
      width={1024}
      height={1536}
      onError={() => setFailed(true)}
      className="bubble-in w-60 rounded-2xl rounded-bl-md object-cover"
    /></PhotoViewer>
  );
}


const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "😡"] as const;
const reactionStorageKey = (conversationId: string, messageId: string) =>
  `chats:local-reaction:${conversationId}:${messageId}`;

/** Initial device-local UI: no AI generation, message mutation or relationship impact. */
function ReactionBubble({ messageId, conversationId, mine, timestamp, body }: {
  messageId: string; conversationId: string; mine: boolean; timestamp: string; body: string;
}) {
  const key = reactionStorageKey(conversationId, messageId);
  const [reaction, setReaction] = useState<string | null>(() => {
    try { return typeof window === "undefined" ? null : window.localStorage.getItem(key); }
    catch { return null; }
  });
  const [open, setOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const choose = (emoji: string) => {
    const next = reaction === emoji ? null : emoji;
    setReaction(next);
    try {
      if (next) window.localStorage.setItem(key, next);
      else window.localStorage.removeItem(key);
    } catch { /* private browsing can block local storage */ }
    setOpen(false);
  };
  useEffect(() => () => clearPress(), []);
  return (
    <div className="relative max-w-full">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={`${timestamp} · React to message`}
            aria-label={`React to message: ${body.slice(0, 80)}`}
            onPointerDown={(e) => {
              if (e.pointerType === "touch") {
                clearPress();
                pressTimer.current = setTimeout(() => setOpen(true), 450);
              }
            }}
            onPointerUp={clearPress}
            onPointerCancel={clearPress}
            onPointerLeave={clearPress}
            onContextMenu={(e) => { e.preventDefault(); clearPress(); setOpen(true); }}
            className={cn(
              "bubble-in block max-w-full whitespace-pre-wrap break-words px-3.5 py-2 text-left text-[15px] leading-snug",
              mine ? "rounded-2xl rounded-br-md bg-bubble-me text-bubble-me-foreground" : "rounded-2xl rounded-bl-md bg-bubble-them text-bubble-them-foreground",
            )}
          >{body}</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={mine ? "end" : "start"} side="top" className="flex min-w-0 gap-1 rounded-full p-1.5">
          {REACTION_EMOJIS.map((emoji) => (
            <DropdownMenuItem key={emoji} onSelect={() => choose(emoji)}
              aria-label={`React with ${emoji}`}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full p-0 text-xl focus:bg-muted">
              {emoji}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {reaction && <button type="button" onClick={() => setOpen(true)}
        aria-label={`Current reaction ${reaction}. Tap to change or remove`}
        className={cn("relative -mt-1.5 flex w-fit min-h-7 items-center rounded-full border bg-background px-2 text-sm shadow-sm", mine ? "ml-auto mr-1" : "ml-1")}>
        {reaction}
      </button>}
    </div>
  );
}
