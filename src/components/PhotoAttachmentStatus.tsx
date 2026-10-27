import { ImageIcon, AlertCircle } from "lucide-react";
/** A pending attachment is not a delivered image or a reason to disable chat. */
export function PhotoAttachmentStatus({
  pending,
  failure,
}: {
  pending?: unknown;
  failure?: unknown;
}) {
  if (pending)
    return (
      <div
        role="status"
        className="flex max-w-64 items-start gap-3 rounded-2xl border bg-card p-4 text-sm text-muted-foreground"
      >
        <ImageIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <span className="block font-medium text-foreground">Preparing photo</span>
          <span className="text-xs">You can keep chatting.</span>
        </div>
      </div>
    );
  if (typeof failure === "string")
    return (
      <div
        role="status"
        className="flex max-w-64 items-start gap-3 rounded-2xl border bg-card p-4 text-sm text-muted-foreground"
      >
        <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <span className="mb-1 block font-medium text-foreground">Photo unavailable</span>
          {failure}
        </div>
      </div>
    );
  return null;
}
