import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { profilePhotoChoices, chooseProfilePhoto } from "@/lib/visual-profiles.functions";
import type { CharacterKey } from "@/lib/characters";
import { PhotoViewer } from "./PhotoViewer";
import { useRef } from "react";
import { ProfileImageEditor } from "./ProfileImageEditor";
import { toast } from "sonner";
export function ProfilePhotoPanel({
  character,
  canonical,
}: {
  character: CharacterKey;
  canonical: string;
}) {
  const upload = useRef<HTMLInputElement>(null);
  const [uploadUrl, setUploadUrl] = useState("");
  const [expanded, setExpanded] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [reason, setReason] = useState("Using my original profile portrait."),
    [approved, setApproved] = useState(false),
    [busy, setBusy] = useState(false);
  const load = useServerFn(profilePhotoChoices),
    choose = useServerFn(chooseProfilePhoto),
    cache = useQueryClient();
  const q = useQuery({
    queryKey: ["profile-photo-choices", character],
    queryFn: () => load({ data: { key: character } }),
    enabled: expanded,
    retry: false,
  });
  useEffect(() => {
    const change = () => setExpanded(true);
    window.addEventListener("change-profile-photo", change);
    return () => window.removeEventListener("change-profile-photo", change);
  }, []);
  const currentId = q.data?.activeMessageId,
    currentReason = q.data?.activeReason,
    ready = q.data?.available,
    custom = !!q.data?.activeStorageUrl;
  useEffect(() => {
    if (expanded && ready) {
      setSelected(currentId ?? (custom ? "custom" : null));
      setReason(
        currentReason ||
          (currentId
            ? "A recent everyday portrait for my profile."
            : "Using my original profile portrait."),
      );
      setApproved(false);
    }
  }, [expanded, ready, currentId, currentReason, custom]);
  async function save() {
    setBusy(true);
    try {
      await choose({ data: { key: character, messageId: selected, reason, approved: true } });
      await cache.invalidateQueries({ queryKey: ["active-portraits"] });
      await cache.invalidateQueries({ queryKey: ["profile-photo-choices", character] });
      toast.success("Current profile photo updated. Original identity anchor preserved.");
      setExpanded(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-6 rounded-2xl border bg-surface p-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full text-left text-sm font-medium"
      >
        Current profile photo & identity
      </button>
      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Display photos and canonical references are separate. The established portrait remains
            the identity anchor until you explicitly approve a replacement. Ordinary generations
            never replace it.
          </p>
          <input
            ref={upload}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 10_000_000) {
                toast.error("Choose a photo smaller than 10 MB");
                return;
              }
              setUploadUrl(URL.createObjectURL(f));
            }}
          />
          <button
            className="min-h-11 rounded-full border px-4 text-sm"
            onClick={() => upload.current?.click()}
          >
            Upload / crop a new photo
          </button>
          {uploadUrl && (
            <ProfileImageEditor
              character={character}
              source={async () => uploadUrl}
              onClose={() => {
                URL.revokeObjectURL(uploadUrl);
                setUploadUrl("");
              }}
            />
          )}
          <p className="text-xs">
            Select any received photo in Shared media, then use its More menu or long press to set a
            profile photo.
          </p>
          {q.data?.canonicalUrl && (
            <PhotoViewer src={q.data.canonicalUrl} alt="Current approved canonical identity">
              <img
                src={q.data.canonicalUrl}
                alt="Current approved identity reference"
                className="h-24 w-24 rounded-full object-cover"
              />
            </PhotoViewer>
          )}
          {q.data?.activeStorageUrl && (
            <div className="text-xs">
              <PhotoViewer src={q.data.activeStorageUrl} alt="Current display avatar">
                <img
                  src={q.data.activeStorageUrl}
                  alt="Current display avatar"
                  className="h-24 w-24 rounded-full object-cover"
                />
              </PhotoViewer>
              <p>Your custom display avatar is active.</p>
            </div>
          )}
          <PhotoViewer src={canonical} alt="Original canonical identity">
            <img
              src={canonical}
              alt="Original canonical identity"
              className="h-24 w-24 rounded-full object-cover"
            />
          </PhotoViewer>
          {q.error && (
            <p role="alert" className="text-sm">
              {q.error.message}
            </p>
          )}
          {q.data && !q.data.available && (
            <p className="text-sm">Profile changes require reviewed migration 0015.</p>
          )}
          {q.data?.available && (
            <>
              <label className="flex gap-2 text-sm">
                <input
                  type="radio"
                  checked={selected === null}
                  onChange={() => {
                    setSelected(null);
                    setReason("Back to my original profile portrait.");
                    setApproved(false);
                  }}
                />
                Use the original display portrait (keep the approved identity reference)
              </label>
              <div className="grid grid-cols-3 gap-3">
                {q.data.choices.map((c) => (
                  <label key={c.id} className="space-y-2 text-xs">
                    <PhotoViewer src={c.url} alt="Review profile candidate">
                      <img
                        src={c.url}
                        alt="Profile candidate"
                        className="h-24 w-full rounded-xl object-cover"
                      />
                    </PhotoViewer>
                    <span className="flex gap-2">
                      <input
                        type="radio"
                        checked={selected === c.id}
                        onChange={() => {
                          setSelected(c.id);
                          setReason("A recent everyday portrait for my profile.");
                          setApproved(false);
                        }}
                      />
                      Select
                    </span>
                  </label>
                ))}
              </div>
              {!q.data.choices.length && (
                <p className="text-xs text-muted-foreground">
                  No screened casual portraits available yet. Objects, intimate photos and older
                  unverified images cannot become profile photos.
                </p>
              )}
              <label className="block text-sm">
                Reason for the update
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={200}
                  className="mt-1 w-full rounded-xl border bg-background p-3"
                />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />
                I reviewed this photo and approve it as the same fictional person.
              </label>
              <button
                disabled={!approved || selected === "custom" || reason.trim().length < 5 || busy}
                onClick={() => void save()}
                className="w-full rounded-full bg-primary p-3 text-sm text-primary-foreground disabled:opacity-40"
              >
                {busy ? "Updating…" : "Approve current profile photo"}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
