import { relationshipDraftKey, readRelationshipDraft } from "@/lib/relationship-commitments";
import { persistQueuedMessage } from "@/lib/chat-outbox";
import { messageReceipt, nearConversationEnd, parseOutbox, type QueuedMessage } from "@/lib/chat-presentation";
import { useChatViewport } from "@/lib/use-chat-viewport";
import { ConversationCalls } from "@/components/ConversationCalls";
import { PhotoAttachmentStatus } from "@/components/PhotoAttachmentStatus";
import { refreshPendingPhotos } from "@/lib/photo-reference-library.functions";
import { ReactionBubble } from "@/components/ReactionBubble";
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
import { ArrowUp, ArrowDown, Camera, ChevronLeft, MoreVertical } from "lucide-react";
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
  component: ChatRoute,
});

// ---- Offline outbox: messages sent without connectivity wait here. ----
type QueuedMsg = QueuedMessage;
const queueKey = (convId: string) => `tess:outbox:${convId}`;
function readQueue(convId: string): QueuedMsg[] {
  try {
    return parseOutbox(localStorage.getItem(queueKey(convId)));
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

function ChatRoute() {
  const { conversationId } = Route.useParams();
  return <Chat key={conversationId} conversationId={conversationId} />;
}

function Chat({ conversationId }: { conversationId: string }) {
  const portraits=usePortraits();
  const viewport = useChatViewport();
  const qc = useQueryClient();
  const respond = useServerFn(tessRespond);
  const read = useServerFn(markRead);

  const conv = useQuery(conversationQuery(conversationId));
  const convId = conv.data?.id;
  const [historyLimit, setHistoryLimit] = useState(200);
  const msgs = useQuery(messagesQuery(convId, historyLimit));
  const pollPhotos=useServerFn(refreshPendingPhotos);
  const refetchMessages=msgs.refetch;
  const hasPendingPhoto=msgs.data?.some(m=>!!(m.metadata as {photo_pending?:unknown}|null)?.photo_pending)??false;
  useEffect(()=>{
    if(!hasPendingPhoto || !convId)return;
    let active=true;
    const timer=setInterval(()=>{void pollPhotos({data:{conversationId:convId}}).then(()=>{
      if(active)void refetchMessages();
    }).catch(()=>{});},10000);
    return ()=>{active=false;clearInterval(timer);};
  },[hasPendingPhoto,convId,pollPhotos,refetchMessages]);
  const characterKey = (conv.data?.character as { key?: string } | null)?.key;
  const def = characterFor(characterKey);

  const [now, setNow] = useState(() => Date.now());
  const [text, setText] = useState("");
  const [queue, setQueue] = useState<QueuedMsg[]>(() => readQueue(conversationId));
  const [queueRetry, setQueueRetry] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const sendingRef = useRef(false);
  const flushingRef = useRef(false);
  const [sending, setSending] = useState(false);
  const keepAtEnd = useRef(true);
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  const again = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const olderScrollHeight = useRef<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const homeDraft = useRef<{ text: string; homeKey: string; activity: string } | null>(null);
  // The Home Moments action prepares a one-use draft. It never sends a message
  // on navigation and never overwrites an actively edited composer.
  useEffect(() => {
    const key = "home-moment-draft:" + conversationId;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    sessionStorage.removeItem(key);
    try {
      const draft = JSON.parse(raw) as { text?: unknown; homeKey?: unknown; activity?: unknown };
      if (typeof draft.text === "string" && draft.text.trim().length > 0 && draft.text.length <= 500) {
        if (typeof draft.homeKey === "string" && draft.homeKey.length <= 140 &&
            typeof draft.activity === "string" && draft.activity.length <= 30)
          homeDraft.current = { text: draft.text, homeKey: draft.homeKey, activity: draft.activity };
        setText(current => current.trim() ? current : draft.text as string);
      }
    } catch {
      // Discard an invalid one-time draft rather than disturbing the chat.
    }
  }, [conversationId]);

  useEffect(() => {
    if (!characterKey) return;
    const key = relationshipDraftKey(conversationId);
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      sessionStorage.removeItem(key);
      const draft = readRelationshipDraft(raw, characterKey);
      if (draft) setText(current => current.trim() ? current : draft);
    } catch { /* Keep the existing composer if temporary storage is unavailable. */ }
  }, [conversationId, characterKey]);

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
    try {
      await respond({ data: { conversationId, tz: userTz() } });
      await refetch();
      await invalidateSchedule(qc);
      setNow(Date.now());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reply right now");
    } finally {
      inFlight.current = false;
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
      const { error } = await supabase.from("messages").insert({ conversation_id: convId, user_id: u.user!.id, sender: "user", body, metadata: { user_photo: path } });
      if (error) throw error;
      setText(current => current.trim() === body ? "" : current);
      keepAtEnd.current = true;
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

  async function send(nativeBody?: string) {
    const body = (nativeBody ?? text).trim();
    if (!body || !convId || sendingRef.current) return;
    keepAtEnd.current = true;
    const outgoing = { id: crypto.randomUUID(), body, at: Date.now() };
    if (nativeBody === undefined) setText("");
    if (!navigator.onLine) {
      // Offline: queue locally, send when connectivity returns. No fake reply.
      try {
        const q = [...readQueue(conversationId), outgoing];
        writeQueue(conversationId, q);
        setQueue(q);
      } catch {
        setText(current => current ? `${body}\n\n${current}` : body);
        toast.error("Offline storage is unavailable. Keep this draft open until you reconnect.");
      }
      taRef.current?.focus();
      return;
    }
    sendingRef.current = true;
    setSending(true);
    try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Please sign in again to send your message.");
    // Provenance is an activity *suggestion*, never evidence that an outing occurred.
    const draftSource = homeDraft.current;
    const origin = draftSource && draftSource.text.trim() === body
      ? { home_moment_prompt: { home_key: draftSource.homeKey, activity: draftSource.activity } }
      : undefined;
    const { error } = await supabase.from("messages").insert({
      id: outgoing.id, conversation_id: convId, user_id: u.user!.id, sender: "user", body,
      ...(origin ? { metadata: origin } : {}),
    });
    if (error) throw error;
    homeDraft.current = null;
    setNow(Date.now());
    await refetch();
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { debounce.current = null; void runRespond(); }, 2500);
    taRef.current?.focus();
    } catch {
      // Preserve the exact request ID after an uncertain acknowledgment. A retry
      // verifies the stored row instead of creating another user message.
      try {
        const queued = readQueue(conversationId);
        const next = queued.some(m => m.id === outgoing.id) ? queued : [...queued, outgoing];
        writeQueue(conversationId, next);
        setQueue(next);
        toast.error("Sending wasn't confirmed. Your text is saved on this device.");
      } catch {
        setText(current => current ? `${body}\n\n${current}` : body);
        toast.error("Message wasn't confirmed. Your text is back in the composer.");
      }
    } finally { sendingRef.current = false; setSending(false); }
  }

  // Native Android message bridge. Keep auth tokens in the web session;
  // only sanitized display data and temporary signed media URLs are shared.
  const nativePhotoUrls = useRef(new Map<string, { url: string; until: number }>());
  useEffect(() => {
    if (!msgs.isSuccess || !convId) return;
    const bridge = (window as Window & {
      LivingWorldAndroid?: { receiveMessages?: (json: string) => void };
    }).LivingWorldAndroid;
    const receiveMessages = bridge?.receiveMessages;
    if (!receiveMessages) return;
    let cancelled = false;
    void (async () => {
      const messages = await Promise.all(visible.slice(-120).map(async (m) => {
        const md = m.metadata as {
          photo?: string; generated_path?: string; user_photo?: string;
        } | null;
        let photo = md?.photo ? PHOTO_SRC[md.photo] : undefined;
        const storagePath = md?.generated_path ?? md?.user_photo;
        if (storagePath) {
          const previous = nativePhotoUrls.current.get(storagePath);
          if (previous && previous.until > Date.now()) photo = previous.url;
          else {
            try {
              const { data, error } = await supabase.storage.from("tess-photos")
                .createSignedUrl(storagePath, 3600);
              if (!error && data?.signedUrl) {
                photo = data.signedUrl;
                nativePhotoUrls.current.set(storagePath, {
                  url: photo, until: Date.now() + 45 * 60_000,
                });
              }
            } catch { /* A media preview can be unavailable without hiding text. */ }
          }
        }
        return {
          id: m.id,
          text: m.body ?? "",
          outgoing: m.sender === "user",
          timestamp: new Date(m.created_at).getTime(),
          photo: photo ?? "",
        };
      }));
      if (!cancelled) receiveMessages(JSON.stringify({ conversationId: convId, messages }));
    })();
    return () => { cancelled = true; };
  }, [conversationId, convId, msgs.isSuccess, msgs.data, now]);

  useEffect(() => {
    if (!convId) return;
    const handler = (event: Event) => {
      const data = (event as CustomEvent<{ conversationId?: string; text?: string }>).detail;
      if (!data || data.conversationId !== convId ||
          typeof data.text !== "string" || !data.text.trim() ||
          data.text.length > 4000) return;
      void send(data.text);
    };
    window.addEventListener("living-world-native-send", handler);
    (window as Window & { __livingWorldNativeChatReady?: string }).__livingWorldNativeChatReady = convId;
    return () => {
      window.removeEventListener("living-world-native-send", handler);
      if ((window as Window & { __livingWorldNativeChatReady?: string }).__livingWorldNativeChatReady === convId)
        delete (window as Window & { __livingWorldNativeChatReady?: string }).__livingWorldNativeChatReady;
    };
  });

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
    if (!online || !convId || !queue.length || flushingRef.current) return;
    flushingRef.current = true;
    void (async () => {
      try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const pendingOut = readQueue(conversationId);
      for (const m of pendingOut) {
        await persistQueuedMessage(supabase, u.user.id, convId, m);
        writeQueue(conversationId, readQueue(conversationId).filter((x) => x.id !== m.id));
      }
      setQueue(readQueue(conversationId));
      await refetch();
      debounce.current = setTimeout(() => { debounce.current = null; void runRespond(); }, 1500);
      } finally { flushingRef.current = false; }
    })().catch(() => toast.error("Queued messages are still on this device. Reconnect to send them."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, convId, queueRetry]);

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
    const element = scroller.current;
    if (!element) return;
    if (olderScrollHeight.current !== null) {
      if (!msgs.isFetching) {
        element.scrollTop += element.scrollHeight - olderScrollHeight.current;
        olderScrollHeight.current = null;
      }
      return;
    }
    if (keepAtEnd.current) element.scrollTo({ top: element.scrollHeight });
  }, [visible.length, pending.length, msgs.isFetching, queue.length]);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const needed = ta.scrollHeight + 2; // Include borders so one-line text does not gain a scrollbar.
    ta.style.height = Math.min(144, Math.max(46, needed)) + "px";
    ta.style.overflowY = needed > 144 ? "auto" : "hidden";
  }, [text]);

  const nextPending = pending[0];
  const showTyping = useMemo(() => {
    if (!conv.data?.typing_indicator || !nextPending) return false;
    const left = new Date(nextPending.visible_at).getTime() - now;
    return left <= Math.min(9000, 1800 + nextPending.body.length * 90);
  }, [conv.data?.typing_indicator, nextPending, now]);

  const lastUserIdx = visible.map((m) => m.sender).lastIndexOf("user");
  const readReceipt = lastUserIdx < 0 ? null : messageReceipt(visible[lastUserIdx]!.id, all, !!conv.data?.read_receipts);
  function jumpToLatest() {
    const element = scroller.current;
    if (!element) return;
    keepAtEnd.current = true;
    setAwayFromEnd(false);
    element.scrollTo({ top: element.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }


  if (!characterKey) return <ContactPending conversationId={conversationId} failed={!!conv.error || !conv.isPending} retry={() => void conv.refetch()} />;

  return (
    <ConversationMedia messages={visible} character={def.key}><div ref={viewport} data-character={def.key} className="conversation-screen flex flex-col bg-background">
      <header className="pt-safe z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-1 px-2">
          <Link to="/inbox" aria-label="Back to Chats" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted">
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <Link
            to="/profile/$conversationId"
            params={{ conversationId }}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-1 pr-2"
            aria-label={`${def.preferredName}'s profile`}
          >
            <img src={portraits.data?.[def.key]??def.avatar} alt="" width={1024} height={1024} className="h-11 w-11 shrink-0 rounded-full object-cover" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[15px] font-semibold">{def.preferredName}</div>
              <div className="truncate text-xs text-muted-foreground">{showTyping ? "typing…" : "Tap for contact info"}</div>
            </div>
          </Link>
          <CallButton conversationId={conversationId} name={def.preferredName}/>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Conversation options" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted">
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
      <ConversationCalls conversationId={conversationId} name={def.preferredName}/>
      <div ref={scroller} role="region" aria-label={`Messages with ${def.preferredName}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" onScroll={() => {
        if (!scroller.current) return;
        keepAtEnd.current = nearConversationEnd(scroller.current);
        setAwayFromEnd(!keepAtEnd.current);
      }}>
        <div className="mx-auto flex min-h-full max-w-xl flex-col justify-end px-4 py-5">
          {msgs.isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p> : null}
          {all.length >= historyLimit && <button type="button" disabled={msgs.isFetching} className="mx-auto mb-4 min-h-11 rounded-full border px-4 text-sm text-primary disabled:opacity-50" onClick={() => { olderScrollHeight.current = scroller.current?.scrollHeight ?? null; setHistoryLimit(n => n + 200); }}>{msgs.isFetching ? "Loading earlier messages…" : "Load older messages"}</button>}
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
                  <div className={cn("flex max-w-[85%] sm:max-w-[78%] flex-col gap-0.5", mine ? "items-end" : "items-start")}>
                  {(() => {
                    const video = userVideoMetadata(m.metadata);
                    if (video) return <VideoAttachment video={video} mediaId={m.id} />;
                    const md = m.metadata as { photo?: string; generated_path?: string; photo_pending?: {actionId:string};photo_failure?:string; user_photo?: string } | null;
                    if (md?.photo_pending || md?.photo_failure) return <PhotoAttachmentStatus pending={md.photo_pending} failure={md.photo_failure} />;
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
          {queue.filter(q => !visible.some(m => m.id === q.id)).map((q) => (
            <div key={q.id} className="mb-2 flex justify-end">
              <div className="flex max-w-[85%] sm:max-w-[78%] flex-col items-end gap-0.5">
                <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-bubble-me px-3.5 py-2 text-[15px] leading-snug text-bubble-me-foreground opacity-70">
                  {q.body}
                </div>
                <div className="pr-1 text-[11px] text-muted-foreground">{online ? "Not confirmed · Saved on this device" : "Queued · Sends when you’re back online"}</div>
              </div>
            </div>
          ))}
          {online && queue.length > 0 && <button type="button" className="mx-auto my-2 min-h-11 rounded-full border bg-card px-4 text-sm" onClick={() => setQueueRetry(n => n + 1)}>Send queued messages</button>}
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

      {awayFromEnd && <div className="pointer-events-none relative mx-auto h-0 w-full max-w-xl">
        <button type="button" onClick={jumpToLatest} className="pointer-events-auto absolute right-4 bottom-3 flex min-h-11 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium shadow-md">
          <ArrowDown size={16} aria-hidden="true" /> Latest messages
        </button>
      </div>}
      {!online && <p role="status" className="border-t bg-surface px-4 py-2 text-center text-xs text-muted-foreground">Offline · New texts stay on this device until you reconnect.</p>}
      {msgs.isError && <p role="alert" className="border-t px-4 py-2 text-center text-sm">Messages couldn’t refresh. <button type="button" className="min-h-11 underline" onClick={() => void msgs.refetch()}>Try again</button></p>}
      <form
        aria-label={`Message ${def.preferredName}`}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="pb-safe shrink-0 border-t border-border/70 bg-background/95"
      >
        <div className="mx-auto flex max-w-xl items-end gap-1.5 px-3 pt-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void sendPhoto(f); }} />
          <button type="button" aria-label="Send a photo" disabled={uploading || !online} onClick={() => fileRef.current?.click()} className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-opacity disabled:opacity-30">
            <Camera className={cn("h-5 w-5", uploading && "animate-pulse")} />
          </button>
          {convId&&<VideoUploadButton conversationId={convId} caption={text.trim()} disabled={uploading||!online} onSent={async(caption,newlySent)=>{
            setText(current=>current.trim()===caption?"":current);setNow(Date.now());await refetch();
            if(newlySent){if(debounce.current)clearTimeout(debounce.current);debounce.current=setTimeout(()=>{debounce.current=null;void runRespond();},2500);}
          }}/>}
          <textarea
            ref={taRef}
            rows={1}
            aria-label={`Message ${def.preferredName}`}
            enterKeyHint="send"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={`Message ${def.preferredName}…`}
            className="max-h-36 min-h-10 min-w-0 flex-1 resize-none rounded-3xl border bg-surface px-4 py-2.5 text-base outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            aria-label={sending ? "Sending message" : "Send"}
            className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
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
