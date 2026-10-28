import { updateSettings } from "@/lib/tess.functions";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  loadReferenceLibrary,
  previewReference,
  changeReference,
  setReferenceProviderPreference,
  checkSpicyJob,
} from "@/lib/photo-reference-library.functions";
import { CHARACTERS, type CharacterKey } from "@/lib/characters";
import { REFERENCE_ROLES, type ReferenceRole } from "@/lib/photo-reference-library";
const labels: Record<ReferenceRole, string> = {
  canonical: "Canonical identity",
  half_body: "Half-body",
  alternate_angle: "Alternate angle",
};
export function ReferenceLibrary() {
  const load = useServerFn(loadReferenceLibrary),
    preview = useServerFn(previewReference),
    change = useServerFn(changeReference),
    preference = useServerFn(setReferenceProviderPreference),
    settings = useServerFn(updateSettings),
    jobStatus = useServerFn(checkSpicyJob);
  const [key, setKey] = useState<CharacterKey>("tess"),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<{
      id: string | null;
      asset: string;
      source: string;
      rejected: boolean;
    } | null>(null),
    [image, setImage] = useState(""),
    [reviewedSha, setReviewedSha] = useState<string | null>(null),
    [role, setRole] = useState<ReferenceRole>("half_body"),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState("");
  const uncertain = useRef<{ signature: string; id: string } | null>(null);
  const q = useQuery({
    queryKey: ["reference-library", key, offset],
    queryFn: () => load({ data: { character: key, offset } }),
    retry: false,
  });
  const page = q.data?.page;
  async function choose(c: {
    id: string | null;
    asset: string;
    source: string;
    rejected: boolean;
  }) {
    if (busy) return;
    setSelected(c);
    setImage("");
    setConfirmed(false);
    setRole(c.source === "canonical" ? "canonical" : "half_body");
    setFeedback("");
    setBusy(true);
    try {
      const result = await preview({ data: { character: key, message: c.id } });
      setImage(result.image);
      setReviewedSha(result.sha256);
    } catch (e) {
      setFeedback((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function act(action: "approve" | "reject" | "remove" | "undo", slot?: ReferenceRole) {
    if (!page || busy) return;
    const data = {
      character: key,
      action,
      role: slot ?? role,
      message: action === "approve" || action === "reject" ? (selected?.id ?? null) : null,
      hash: page.hash,
      version: page.version,
      undo: action === "undo" ? page.lastAction : null,
      visualConfirmed: confirmed,
      reviewedSha,
    };
    const signature = JSON.stringify(data);
    if (uncertain.current && uncertain.current.signature !== signature) {
      setFeedback("Refresh reviews before starting a different action after an uncertain result.");
      return;
    }
    uncertain.current ??= { signature, id: crypto.randomUUID() };
    setBusy(true);
    setFeedback("");
    try {
      await change({ data: { ...data, id: uncertain.current.id } });
      uncertain.current = null;
      setFeedback("Review saved.");
      setConfirmed(false);
      await q.refetch();
    } catch (e) {
      setFeedback((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-2xl border p-4" aria-label="Reference Library">
      <h2 className="text-lg font-semibold">Reference Library</h2>
      <p className="text-sm text-muted-foreground">
        Review existing photos for identity consistency. Reviewing never generates or purchases an
        image.
      </p>
      <label className="block text-sm">
        Character
        <select
          className="mt-1 min-h-11 w-full rounded-xl border bg-background p-2"
          value={key}
          disabled={busy}
          onChange={(e) => {
            setKey(e.target.value as CharacterKey);
            setOffset(0);
            setSelected(null);
            setImage("");
            setFeedback("");
            uncertain.current = null;
          }}
        >
          {Object.values(CHARACTERS).map((c) => (
            <option key={c.key} value={c.key}>
              {c.preferredName}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm">{q.data?.provider.reason ?? "Checking provider configuration…"}</p>
      <p className="text-xs text-muted-foreground">
        Everyday photos keep their current provider. SpicyAPI requires verified account credits,
        spending limits and approved references. Keys are configured only in Lovable Secrets.
      </p>
      {q.data?.provider.budgetsConfigured && (
        <p className="text-xs text-muted-foreground">
          Reservations: ${(q.data.provider.jobCents / 100).toFixed(2)} per job · $
          {(q.data.provider.dailyCents / 100).toFixed(2)} per UTC day · $
          {(q.data.provider.monthlyCents / 100).toFixed(2)} per rolling 30 days. Actual provider
          costs are reconciled when known.
        </p>
      )}
      {q.isLoading && <p role="status">Loading references…</p>}
      {q.error && (
        <p role="alert">{q.error.message}. A conversation with this character is required.</p>
      )}
      {page && (
        <>
          <p role="status">{page.status}</p>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={page.matureEnabled}
              disabled={busy || !page.romanticCapable}
              onChange={(e) => {
                setBusy(true);
                void settings({
                  data: {
                    conversationId: page.conversationId,
                    mature_photography: e.target.checked,
                  },
                })
                  .then(() => q.refetch())
                  .catch((e) => setFeedback((e as Error).message))
                  .finally(() => setBusy(false));
              }}
            />
            Allow non-nude romantic photos from this character
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={page.spicyEnabled}
              disabled={
                busy ||
                !page.available ||
                !page.romanticCapable ||
                (!page.spicyEnabled && !q.data?.provider.ready)
              }
              onChange={(e) => {
                const enabled = e.target.checked;
                const adult = enabled
                  ? window.confirm(
                      "I confirm I am 18 or older and opt into non-nude romantic photos using SpicyAPI. Existing character boundaries still apply.",
                    )
                  : page.adultConfirmed;
                if (enabled && !adult) return;
                setBusy(true);
                void preference({ data: { character: key, enabled, adult, version: page.version } })
                  .then(() => q.refetch())
                  .catch((e) => setFeedback((e as Error).message))
                  .finally(() => setBusy(false));
              }}
            />
            Use SpicyAPI for non-nude romantic photos
          </label>
          <p className="text-xs">
            Canonical approval here selects the existing approved identity for provider use; it does
            not replace their face. Intentional identity changes use profile photo management.
          </p>
          <ul className="space-y-2">
            {REFERENCE_ROLES.map((r) => {
              const s = page.slots.find((s) => s.role === r);
              return (
                <li
                  key={r}
                  className="flex items-center justify-between gap-2 rounded-xl bg-muted p-3 text-sm"
                >
                  <span>
                    {labels[r]}:{" "}
                    {s
                      ? s.canonical_sha256 === page.hash
                        ? "Approved"
                        : "Identity changed — review again"
                      : "Not selected"}
                  </span>
                  {s && (
                    <button
                      className="min-h-11 px-2 underline"
                      disabled={busy}
                      onClick={() => void act("remove", r)}
                    >
                      Clear
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-11 rounded-full border px-4"
              disabled={busy}
              onClick={() => {
                uncertain.current = null;
                void q.refetch();
              }}
            >
              Refresh reviews
            </button>
            <button
              className="min-h-11 rounded-full border px-4"
              disabled={busy || !page.lastAction}
              onClick={() => void act("undo")}
            >
              Undo last review
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {page.candidates.map((c) => (
              <button
                key={c.asset}
                className="min-h-16 rounded-xl border p-3 text-left text-sm"
                disabled={busy || !page.available}
                onClick={() => void choose(c)}
              >
                <ReferenceThumbnail character={key} message={c.id} hash={page.hash} />
                {c.source === "canonical"
                  ? "View canonical portrait"
                  : c.source === "uploaded"
                    ? "Preview your uploaded photo"
                    : "Preview received photo"}
                {c.rejected ? " · Rejected" : ""}
                {page.slots.some((s) => s.asset === c.asset) ? " · Selected" : ""}
              </button>
            ))}
          </div>
          {page.candidates.length === 1 && (
            <p className="text-sm">
              No compatible, read, screened generated photos on this page. Older photos without
              identity metadata cannot safely become references.
            </p>
          )}
          <div className="flex gap-2">
            <button
              disabled={busy || offset === 0}
              className="min-h-11 rounded-full border px-4"
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              Newer
            </button>
            <button
              disabled={busy || page.nextOffset === null}
              className="min-h-11 rounded-full border px-4"
              onClick={() => setOffset(page.nextOffset ?? offset)}
            >
              Older
            </button>
          </div>
        </>
      )}
      {selected && image && (
        <div className="space-y-3 rounded-xl border p-3">
          <img
            src={image}
            alt={`${CHARACTERS[key].preferredName} reference preview`}
            className="mx-auto max-h-[60vh] w-full rounded-xl object-contain"
          />
          <label className="block text-sm">
            Reference slot
            <select
              className="mt-1 min-h-11 w-full rounded-xl border bg-background p-2"
              value={role}
              disabled={busy || selected.source === "canonical"}
              onChange={(e) => setRole(e.target.value as ReferenceRole)}
            >
              {REFERENCE_ROLES.filter((r) =>
                selected.source === "canonical" ? r === "canonical" : r !== "canonical",
              ).map((r) => (
                <option key={r} value={r}>
                  {labels[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed the clear, unobscured face, correct character and suitable framing. This
            replaces the selected slot only.
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-11 rounded-full bg-primary px-4 text-primary-foreground"
              disabled={busy || !confirmed || selected.rejected}
              onClick={() => void act("approve")}
            >
              Approve reference
            </button>
            {selected.id && (
              <button
                disabled={busy}
                className="min-h-11 rounded-full border px-4"
                onClick={() => void act("reject")}
              >
                Reject photo
              </button>
            )}
            <button
              disabled={busy}
              className="min-h-11 rounded-full border px-4"
              onClick={() => {
                setSelected(null);
                setImage("");
              }}
            >
              Close preview
            </button>
          </div>
        </div>
      )}
      {!!q.data?.jobs?.length && (
        <details className="rounded-xl border p-3">
          <summary>Recent SpicyAPI jobs</summary>
          {q.data.jobs.map((j) => (
            <div key={j.action_id} className="my-3 text-sm">
              <p>
                {j.status} ·{" "}
                {j.cost_usd === null ? "Cost not yet known" : `$${j.cost_usd} reported`}
              </p>
              {j.failure_code && <p>{j.failure_code}</p>}
              {j.refund_expected && <p>Provider refund expected; verify account credit.</p>}
              {j.job_id && (
                <button
                  disabled={busy}
                  className="min-h-11 rounded-full border px-3"
                  onClick={() => {
                    setBusy(true);
                    void jobStatus({ data: { actionId: j.action_id } })
                      .then(() => q.refetch())
                      .catch((e) => setFeedback((e as Error).message))
                      .finally(() => setBusy(false));
                  }}
                >
                  Refresh status — no generation
                </button>
              )}
            </div>
          ))}
        </details>
      )}
      {feedback && (
        <p role="status" className="text-sm">
          {feedback}
        </p>
      )}
    </section>
  );
}

function ReferenceThumbnail({
  character,
  message,
  hash,
}: {
  character: CharacterKey;
  message: string | null;
  hash: string;
}) {
  const preview = useServerFn(previewReference),
    element = useRef<HTMLSpanElement>(null),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!element.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  const q = useQuery({
    queryKey: ["reference-thumbnail", character, message, hash],
    queryFn: () => preview({ data: { character, message } }),
    enabled: visible,
    staleTime: 60000,
    retry: false,
  });
  return (
    <span ref={element} className="mb-2 block h-24 overflow-hidden rounded-lg bg-muted">
      {q.data ? (
        <img loading="lazy" src={q.data.image} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center text-xs text-muted-foreground">
          {q.error ? "Preview unavailable" : "Tap to review"}
        </span>
      )}
    </span>
  );
}
