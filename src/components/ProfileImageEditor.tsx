import { useEffect, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { profilePhotoChoices } from "@/lib/visual-profiles.functions";
import { saveProfileImage } from "@/lib/profile-media.functions";
import { characterFor, type CharacterKey } from "@/lib/characters";
import { toast } from "sonner";
export function ProfileImageEditor({
  character,
  source,
  sourceMessageId,
  onClose,
}: {
  character: CharacterKey;
  source: () => Promise<string>;
  sourceMessageId?: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [zoom, setZoom] = useState(1),
    [x, setX] = useState(50),
    [y, setY] = useState(50),
    [canonical, setCanonical] = useState(false),
    [approved, setApproved] = useState(false),
    [busy, setBusy] = useState(false);
  const image = useRef<HTMLImageElement>(null),
    save = useServerFn(saveProfileImage),
    cache = useQueryClient();
  const loadReference = useServerFn(profilePhotoChoices);
  const reference = useQuery({
    queryKey: ["profile-photo-choices", character],
    queryFn: () => loadReference({ data: { key: character } }),
    retry: false,
  });
  const sourceRef = useRef(source);
  useEffect(() => {
    let active = true;
    void sourceRef
      .current()
      .then((u) => {
        if (active) setUrl(u);
      })
      .catch(() => {
        if (active) setError("Photo unavailable. Try reopening it.");
      });
    return () => {
      active = false;
    };
  }, []);
  function encoded(crop: boolean) {
    const img = image.current;
    if (!img?.naturalWidth) throw new Error("Wait for the photo to load");
    if (Math.min(img.naturalWidth, img.naturalHeight) < 256)
      throw new Error("Choose a photo at least 256 × 256 pixels");
    const canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing unavailable");
    if (crop) {
      const size = Math.min(img.naturalWidth, img.naturalHeight) / zoom;
      canvas.width = 512;
      canvas.height = 512;
      ctx.drawImage(
        img,
        ((img.naturalWidth - size) * x) / 100,
        ((img.naturalHeight - size) * y) / 100,
        size,
        size,
        0,
        0,
        512,
        512,
      );
    } else {
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    return canvas.toDataURL("image/jpeg", 0.94).split(",")[1];
  }
  async function submit() {
    setBusy(true);
    try {
      await save({
        data: {
          key: character,
          avatar: encoded(true),
          ...(canonical ? { reference: encoded(false) } : {}),
          canonicalApproved: canonical && approved,
          sourceMessageId,
        },
      });
      await cache.invalidateQueries({ queryKey: ["active-portraits"] });
      await cache.invalidateQueries({ queryKey: ["profile-photo-choices", character] });
      toast.success(
        canonical
          ? "Display photo and explicitly approved identity reference updated."
          : "Display photo updated. Canonical identity unchanged.",
      );
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[95dvh] overflow-y-auto">
        <DialogTitle>Change {characterFor(character).preferredName}’s photo</DialogTitle>
        <DialogDescription>
          Crop the display avatar. Changing the identity used for future generations is a separate,
          explicit choice.
        </DialogDescription>
        {error && <p role="alert">{error}</p>}
        {url && (
          <>
            <div className="mx-auto h-56 w-56 overflow-hidden rounded-full border-2">
              <img
                ref={image}
                crossOrigin="anonymous"
                src={url}
                alt="Profile crop preview"
                onError={() =>
                  setError("Image could not be read securely. Try downloading and uploading it.")
                }
                className="h-full w-full object-cover"
                style={{
                  objectPosition: `${x}% ${y}%`,
                  transform: `scale(${zoom})`,
                  transformOrigin: `${x}% ${y}%`,
                }}
              />
            </div>
            <label className="text-sm">
              Zoom
              <input
                aria-label="Avatar zoom"
                type="range"
                min="1"
                max="3"
                step=".05"
                value={zoom}
                onChange={(e) => setZoom(+e.target.value)}
                className="w-full"
              />
            </label>
            <label className="text-sm">
              Horizontal position
              <input
                aria-label="Avatar horizontal position"
                type="range"
                min="0"
                max="100"
                value={x}
                onChange={(e) => setX(+e.target.value)}
                className="w-full"
              />
            </label>
            <label className="text-sm">
              Vertical position
              <input
                aria-label="Avatar vertical position"
                type="range"
                min="0"
                max="100"
                value={y}
                onChange={(e) => setY(+e.target.value)}
                className="w-full"
              />
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={canonical}
                onChange={(e) => {
                  setCanonical(e.target.checked);
                  setApproved(false);
                }}
              />
              Also approve this image as the canonical identity for future generations
            </label>
            {canonical && (
              <div className="rounded-xl border p-3 text-sm">
                <div className="mb-3 flex items-start gap-3">
                  <div>
                    <img
                      src={reference.data?.canonicalUrl || characterFor(character).avatar}
                      alt="Current approved reference"
                      className="h-28 w-28 rounded-xl object-contain"
                    />
                    <p className="text-xs">Current identity reference</p>
                  </div>
                  <div>
                    <img
                      src={url}
                      alt="Candidate identity reference"
                      className="h-28 w-28 rounded-xl object-contain"
                    />
                    <p className="text-xs">Proposed reference</p>
                  </div>
                </div>
                <p>
                  Only approve a clear photo of the same fictional adult, alone, with an unobscured
                  face. Pets, groups, illustrations, heavy filters and a different person are
                  unsuitable. Automated checks verify format and integrity, not facial identity. The
                  provider may still fail to preserve likeness; screening remains required. The
                  uncropped photo will be used as reference.
                </p>
                <label className="mt-3 flex gap-2">
                  <input
                    type="checkbox"
                    checked={approved}
                    onChange={(e) => setApproved(e.target.checked)}
                  />
                  I visually compared this with the established portrait and explicitly approve the
                  same identity.
                </label>
              </div>
            )}
            <button
              disabled={busy || !!error || (canonical && !approved)}
              onClick={() => void submit()}
              className="min-h-12 rounded-full bg-primary p-3 text-primary-foreground disabled:opacity-40"
            >
              {busy
                ? "Saving…"
                : canonical
                  ? "Confirm avatar and canonical reference"
                  : "Save display avatar only"}
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
