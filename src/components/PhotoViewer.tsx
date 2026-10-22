import { useState, useRef } from "react";
import { Download, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
export function PhotoViewer({
  src,
  alt,
  children,
  filename = "shared-photo.jpg",
}: {
  src: string;
  alt: string;
  children: React.ReactNode;
  filename?: string;
}) {
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const extension: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif",
      };
      const downloadName = extension[blob.type]
        ? filename.replace(/\.[a-z0-9]+$/i, `.${extension[blob.type]}`)
        : filename;
      const file = new File([blob], downloadName, { type: blob.type || "image/jpeg" });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: alt });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError")
        toast.error(
          "Could not save. Try reopening the photo link, or use your browser’s image save option.",
        );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <button
        type="button"
        ref={opener}
        aria-label={`Open ${alt}`}
        onClick={() => setOpen(true)}
        className="block max-w-full text-left"
      >
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus({ preventScroll: true });
          }}
          className="flex h-[100dvh] w-screen max-w-none flex-col gap-3 rounded-none border-0 bg-black/95 p-4 pt-[max(1rem,env(safe-area-inset-top))] text-white sm:max-w-none [&>button.absolute]:hidden"
        >
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-medium">{alt}</DialogTitle>
            <button
              aria-label="Close photo"
              onClick={() => setOpen(false)}
              className="flex h-11 w-11 items-center justify-center"
            >
              <X />
            </button>
          </div>
          <DialogDescription className="sr-only">
            Full photo viewer. Save or share this image, or close to return to your conversation.
          </DialogDescription>
          <img src={src} alt={alt} className="min-h-0 flex-1 object-contain" />
          <button
            disabled={saving}
            onClick={() => void save()}
            className="mb-[env(safe-area-inset-bottom)] flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-black disabled:opacity-50"
          >
            <Download size={18} />
            {saving ? "Preparing image…" : "Save / share photo"}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
