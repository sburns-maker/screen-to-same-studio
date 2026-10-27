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
      <div role="status" className="rounded-xl border p-3 text-sm text-muted-foreground">
        Photo is being prepared… You can keep chatting.
      </div>
    );
  if (typeof failure === "string")
    return (
      <div role="status" className="rounded-xl border p-3 text-sm text-muted-foreground">
        {failure}
      </div>
    );
  return null;
}
