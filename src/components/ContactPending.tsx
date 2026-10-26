import { Link } from "@tanstack/react-router";
/** Never render another contact's identity or private panels while this contact loads. */
export function ContactPending({
  conversationId,
  failed,
  retry,
}: {
  conversationId: string;
  failed: boolean;
  retry: () => void;
}) {
  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      <div className="mb-4 h-20 w-20 animate-pulse rounded-full bg-muted" aria-hidden="true" />
      <p role={failed ? "alert" : "status"}>
        {failed ? "Contact unavailable. Try loading again." : "Loading contact…"}
      </p>
      {failed && (
        <button onClick={retry} className="min-h-11 underline">
          Try again
        </button>
      )}
      <Link
        to="/calls"
        search={{ conversation: conversationId }}
        className="mt-4 block min-h-11 py-3 underline"
      >
        Call history
      </Link>
      <Link to="/inbox" className="block min-h-11 py-3 underline">
        Back to Chats
      </Link>
    </main>
  );
}
