import { useState, useRef, useEffect } from "react";
import { Download, Share2, X, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import { toast } from "sonner";
import { useConversationMedia } from "@/lib/media-context";
import { mediaFile, downloadMedia, type MediaItem } from "@/lib/media";
import { resolveMedia } from "@/lib/media-url";
import { ProfileImageEditor } from "./ProfileImageEditor";
export function PhotoViewer({
  src,
  alt,
  children,
  filename: _filename,
  mediaId,
  kind = "image",
}: {
  src: string;
  alt: string;
  children: React.ReactNode;
  filename?: string;
  mediaId?: string | undefined;
  kind?: "image" | "video";
}) {
  const context = useConversationMedia();
  const fallback: MediaItem = { id: mediaId || "photo", kind, src };
  const items = mediaId && context.items.some((i) => i.id === mediaId) ? context.items : [fallback];
  const start = Math.max(
    0,
    items.findIndex((i) => i.id === mediaId),
  );
  const [open, setOpen] = useState(false),
    [index, setIndex] = useState(start),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [details, setDetails] = useState(false),
    [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const opener = useRef<HTMLButtonElement>(null),
    points = useRef(new Map<number, { x: number; y: number }>()),
    gesture = useRef({ x: 0, y: 0, distance: 0, scale: 1, moved: false, multi: false }),
    lastTap = useRef(0),
    marker = useRef(""),
    prepared = useRef<{ id: string; file: File; at: number } | null>(null);
  const current = items[open ? index : start] || fallback;
  const currentId = current.id,
    currentPath = current.path,
    currentSrc = current.src;
  const latest = useRef(current);
  latest.current = current;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUrl("");
    setError("");
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDetails(false);
    prepared.current = null;
    points.current.clear();
    void resolveMedia(latest.current)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled)
          setError("Media unavailable. Close and reopen to refresh its private link.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, currentId, currentPath, currentSrc]);
  useEffect(() => {
    if (!open) return;
    const token = crypto.randomUUID();
    marker.current = token;
    history.pushState({ ...history.state, mediaViewer: token }, "");
    const pop = () => {
      marker.current = "";
      setOpen(false);
    };
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      if (marker.current === token && history.state?.mediaViewer === token) {
        marker.current = "";
        history.back();
      }
    };
  }, [open]);
  useEffect(() => {
    if (zoom === 1) setPan({ x: 0, y: 0 });
  }, [zoom]);
  async function action(which: "save" | "share" | "copy") {
    setBusy(true);
    try {
      const cached = prepared.current;
      const file =
        cached?.id === current.id && Date.now() - cached.at < 300000
          ? cached.file
          : await mediaFile(current, () => resolveMedia(current));
      prepared.current = { id: current.id, file, at: Date.now() };
      if (which === "copy") {
        if (
          file.type !== "image/png" ||
          !navigator.clipboard?.write ||
          typeof ClipboardItem === "undefined"
        )
          throw new Error(
            "Copy is available only for supported PNG images. Use Share or Save instead.",
          );
        await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
        toast.success("Image copied");
      } else if (which === "share" && navigator.canShare?.({ files: [file] }) && navigator.share) {
        if (navigator.userActivation?.isActive === false) {
          toast.info("Original file ready. Tap Share again to open your phone’s share sheet.");
          return;
        }
        await navigator.share({ files: [file], title: alt });
      } else {
        toast.success(await downloadMedia(file));
        if (which === "share")
          toast.info("Native sharing unavailable. Share the downloaded file from Downloads.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        toast.error((e as Error).message || "Media action failed");
    } finally {
      setBusy(false);
    }
  }
  function show() {
    setIndex(start);
    setOpen(true);
  }
  function next(delta: number) {
    setIndex((i) => Math.max(0, Math.min(items.length - 1, i + delta)));
  }
  const canProfile = current.kind === "image" && !!context.character && current.sender === "tess";
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            ref={opener}
            type="button"
            aria-label={`Open ${alt}`}
            onClick={show}
            className="block max-w-full select-none text-left"
            style={{ WebkitTouchCallout: "none" }}
          >
            {children}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={show}>View full screen</ContextMenuItem>
          <ContextMenuItem disabled={busy} onSelect={() => void action("save")}>
            Save to device
          </ContextMenuItem>
          <ContextMenuItem disabled={busy} onSelect={() => void action("share")}>
            Share
          </ContextMenuItem>
          {canProfile && (
            <ContextMenuItem onSelect={() => setEditing(true)}>
              Set as character profile photo
            </ContextMenuItem>
          )}
          <ContextMenuItem disabled={busy} onSelect={() => void action("copy")}>
            Copy image (supported PNG)
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              show();
              setTimeout(() => setDetails(true), 100);
            }}
          >
            View media details
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus({ preventScroll: true });
          }}
          className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-black p-0 text-white sm:max-w-none [&>button.absolute]:hidden"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") next(1);
            if (e.key === "ArrowLeft") next(-1);
          }}
        >
          <header className="flex shrink-0 items-center justify-between px-3 pt-[max(.5rem,env(safe-area-inset-top))]">
            <DialogTitle className="truncate text-sm">
              {alt} · {index + 1}/{items.length}
            </DialogTitle>
            <button
              aria-label="Close photo"
              onClick={() => setOpen(false)}
              className="grid h-12 w-12 place-items-center"
            >
              <X />
            </button>
          </header>
          <DialogDescription className="sr-only">
            Swipe between media. Pinch or double tap photos to zoom, then drag to pan. Android Back
            closes the viewer.
          </DialogDescription>
          <div
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
            aria-label="Media gesture area"
            style={{ touchAction: current.kind === "video" ? "auto" : "none" }}
            onPointerDown={(e) => {
              if (current.kind === "video") return;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              const p = [...points.current.values()];
              gesture.current = {
                x: e.clientX,
                y: e.clientY,
                distance: p.length === 2 ? Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y) : 0,
                scale: zoom,
                moved: false,
                multi: p.length > 1,
              };
            }}
            onPointerMove={(e) => {
              const before = points.current.get(e.pointerId);
              if (!before) return;
              points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              const p = [...points.current.values()];
              if (p.length === 2 && gesture.current.distance) {
                setZoom(
                  Math.max(
                    1,
                    Math.min(
                      5,
                      (gesture.current.scale * Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y)) /
                        gesture.current.distance,
                    ),
                  ),
                );
                gesture.current.moved = true;
              } else if (zoom > 1) {
                const img = e.currentTarget.querySelector("img");
                const boundX = Math.max(
                  0,
                  ((img?.clientWidth ?? 0) * zoom - e.currentTarget.clientWidth) / 2,
                );
                const boundY = Math.max(
                  0,
                  ((img?.clientHeight ?? 0) * zoom - e.currentTarget.clientHeight) / 2,
                );
                setPan((v) => ({
                  x: Math.max(-boundX, Math.min(boundX, v.x + e.clientX - before.x)),
                  y: Math.max(-boundY, Math.min(boundY, v.y + e.clientY - before.y)),
                }));
              }
              if (
                Math.abs(e.clientX - gesture.current.x) > 10 ||
                Math.abs(e.clientY - gesture.current.y) > 10
              )
                gesture.current.moved = true;
            }}
            onPointerCancel={() => points.current.clear()}
            onPointerUp={(e) => {
              if (current.kind === "video") return;
              points.current.delete(e.pointerId);
              if (gesture.current.multi) return;
              const dx = e.clientX - gesture.current.x,
                dy = e.clientY - gesture.current.y;
              if (zoom === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                next(dx < 0 ? 1 : -1);
                lastTap.current = 0;
              } else if (!gesture.current.moved) {
                const now = Date.now();
                if (now - lastTap.current < 320) {
                  setZoom((z) => (z === 1 ? 2.5 : 1));
                  setPan({ x: 0, y: 0 });
                }
                lastTap.current = now;
              }
            }}
          >
            {error ? (
              <p role="alert" className="p-6 text-center">
                {error}
              </p>
            ) : !url ? (
              <p role="status">Loading original media…</p>
            ) : current.kind === "video" ? (
              <video
                key={url}
                src={url}
                controls
                playsInline
                preload="metadata"
                className="h-full w-full object-contain"
                onError={() =>
                  setError("Video unavailable or unsupported. Try reopening or saving it.")
                }
              />
            ) : (
              <img
                src={url}
                alt={alt}
                draggable={false}
                className="max-h-full max-w-full select-none object-contain"
                style={{
                  transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
                  transition: points.current.size ? "none" : "transform 150ms ease-out",
                }}
                onError={() =>
                  setError("Photo unavailable. Close and reopen to renew its private link.")
                }
              />
            )}
          </div>
          <nav
            className="flex shrink-0 items-center justify-around pb-[max(.5rem,env(safe-area-inset-bottom))]"
            aria-label="Media actions"
          >
            <button
              aria-label="Previous media"
              disabled={index === 0}
              className="h-12 px-2 disabled:opacity-30"
              onClick={() => next(-1)}
            >
              <ChevronLeft />
            </button>
            <button
              disabled={busy}
              className="h-12 px-3 text-xs"
              onClick={() => void action("save")}
            >
              <Download className="mx-auto h-5" />
              Save
            </button>
            <button
              disabled={busy}
              aria-label="Share media"
              className="h-12 px-3 text-xs"
              onClick={() => void action("share")}
            >
              <Share2 className="mx-auto h-5" />
              Share
            </button>
            <button
              aria-label="More media actions"
              className="h-12 px-3"
              onClick={() => setDetails(!details)}
            >
              <MoreHorizontal />
            </button>
            <button
              aria-label="Next media"
              disabled={index === items.length - 1}
              className="h-12 px-2 disabled:opacity-30"
              onClick={() => next(1)}
            >
              <ChevronRight />
            </button>
          </nav>
          {details && (
            <div className="shrink-0 space-y-2 border-t border-white/20 p-4 text-xs">
              <p>
                {current.kind} ·{" "}
                {current.at ? new Date(current.at).toLocaleString() : "Original media"}
                {current.bytes ? ` · ${(current.bytes / 1e6).toFixed(1)} MB` : ""}
              </p>
              <p>Original file; private storage links are never copied or shared.</p>
              <button className="mr-4 min-h-11 underline" onClick={() => void action("copy")}>
                Copy image
              </button>
              {canProfile && (
                <button
                  className="min-h-11 underline"
                  onClick={() => {
                    setOpen(false);
                    setEditing(true);
                  }}
                >
                  Set as profile photo
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {editing && context.character && (
        <ProfileImageEditor
          character={context.character}
          sourceMessageId={current.id}
          source={() => resolveMedia(current)}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
