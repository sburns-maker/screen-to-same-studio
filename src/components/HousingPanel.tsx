import { useRef, useState } from "react";
import { ContactRelationshipStory } from "./ContactRelationshipStory";
import { HomeMoments } from "./HomeMoments";
import { HomePhotoGallery } from "./HomePhotoGallery";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { changeHousing } from "@/lib/housing.functions";
import { useHousing } from "@/lib/use-housing";
import { useSchedule, invalidateSchedule } from "@/lib/use-schedule";
import { housingTypes, housingArrangements, type HousingInput } from "@/lib/housing";
import { easternInstant } from "@/lib/plan-edit";
import { card } from "./TownLayout";
export function HousingPanel({ character }: { character?: string | undefined }) {
  const q = useHousing(),
    agenda = useSchedule(),
    save = useServerFn(changeHousing),
    cache = useQueryClient();
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [edit, setEdit] = useState(false),
    [moving, setMoving] = useState(false);
  const [label, setLabel] = useState("My Home"),
    [community, setCommunity] = useState<"Altoona" | "Hollidaysburg" | "Tyrone" | "Duncansville">(
      "Altoona",
    ),
    [type, setType] = useState<(typeof housingTypes)[number]>("apartment"),
    [arrangement, setArrangement] = useState<(typeof housingArrangements)[number]>("renting"),
    [address, setAddress] = useState(""),
    [exact, setExact] = useState(false),
    [description, setDescription] = useState("");
  const [destination, setDestination] = useState("new"),
    [companion, setCompanion] = useState(""),
    [purpose, setPurpose] = useState("individual"),
    [date, setDate] = useState(""),
    [time, setTime] = useState("18:00"),
    [temporary, setTemporary] = useState(false),
    [endDate, setEndDate] = useState(""),
    [endTime, setEndTime] = useState("18:00"),
    [viewer, setViewer] = useState("");
  const ids = useRef(new Map<string, string>());
  async function act(action: HousingInput) {
    setBusy(true);
    setStatus("");
    const key = JSON.stringify(action),
      id = ids.current.get(key) ?? crypto.randomUUID();
    ids.current.set(key, id);
    try {
      await save({ data: { id, action } });
      ids.current.delete(key);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["housing"] }),
        invalidateSchedule(cache),
      ]);
      setStatus("Saved. Invitations and moves still require each participant’s agreement.");
      setEdit(false);
      setMoving(false);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save housing change");
    } finally {
      setBusy(false);
    }
  }
  if (q.isLoading) return <p role="status">Loading homes…</p>;
  if (q.error)
    return (
      <p role="alert">
        Homes are unavailable.{" "}
        <button onClick={() => void q.refetch()} className="underline">
          Retry
        </button>
      </p>
    );
  if (!q.data?.available) return null;
  const home = character
    ? (q.data.homes.find((h) => h.primaryFor.includes(character)) ??
      q.data.homes.find((h) => h.key === `home:${character}`))
    : q.data.homes.find((h) => h.key === q.data.primary);
  const field = "min-h-11 w-full rounded-xl border bg-background p-2";
  const details = () => ({
    label,
    community,
    housingType: type,
    arrangement,
    description,
    ...(address ? { address } : {}),
    showExact: exact,
  });
  const contacts = agenda.data?.contacts ?? [];
  const openEdit = () => {
    if (home) {
      setLabel(home.label);
      setCommunity(
        ["Altoona", "Hollidaysburg", "Tyrone", "Duncansville"].includes(home.community)
          ? (home.community as typeof community)
          : "Altoona",
      );
      setType(home.housingType);
      setArrangement(home.arrangement);
      setDescription(home.description);
      setAddress(home.address ?? "");
      setExact(home.exact);
    }
    setEdit(true);
    setMoving(false);
  };
  return (
    <section
      aria-label={character ? "Contact home" : "My home and household"}
      className={`${card} my-4 space-y-4`}
    >
      <h2 className="font-display text-xl">{character ? "Home" : "My home & household"}</h2>
      {character && <ContactRelationshipStory characterKey={character} characterName={contacts.find((contact) => contact.key === character)?.name ?? character} />}
      {home ? (
        <div>
          <Link
            to="/place/$placeKey"
            params={{ placeKey: home.key }}
            className="font-medium underline"
          >
            ⌂ {home.label}
          </Link>
          <p className="text-sm text-muted-foreground">
            {home.community} ·{" "}
            {home.exact ? (home.address ?? "Fictional home") : "Approximate neighborhood"}
            {!home.canVisit ? " · Invitation required" : ""}
          </p>
        </div>
      ) : (
        <p className="text-sm">
          {character
            ? "Private home details have not been shared."
            : "No primary virtual home selected."}
        </p>
      )}
      {home && (!character || home.canVisit) && <HomeMoments home={home} snapshot={q.data} character={character} />}
      {home && home.canVisit && home.primaryFor.includes("tess") && <HomePhotoGallery homeKey={home.key} />}
      {!character && home && (
        <section aria-label="My home photo memories" className="rounded-2xl border border-border/70 bg-background p-4 sm:p-5">
          <h3 className="font-display text-xl">Your home memories</h3>
          <p className="mt-1 text-sm text-muted-foreground">Your place deserves its own photos and moments too. Only pictures explicitly tied to this residence will appear here—Tess's townhouse photos won't be relabeled as yours.</p>
          <p className="mt-3 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Home-photo uploads and verified room snapshots are coming next. For now, explore your place or invite someone over using Home Moments above.</p>
        </section>
      )}
      {!character && home && (
        <div aria-label="Household overview" className="overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-rose-50/80 via-background to-amber-50/70 p-4 shadow-sm dark:from-rose-950/20 dark:via-background dark:to-amber-950/10 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your little corner of the world</p>
              <h3 className="mt-1 font-display text-2xl leading-tight">{home.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{home.community} · {home.arrangement.replaceAll("_", " ")}</p>
            </div>
            <span aria-hidden="true" className="rounded-full bg-background/80 px-3 py-2 text-xl shadow-sm">⌂</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/60 bg-background/80 p-3">
              <p className="text-xs text-muted-foreground">People at home</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{q.data.members.filter((m) => m.residence_id === home.id && m.kind !== "temporary").length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Recorded residents</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/80 p-3">
              <p className="text-xs text-muted-foreground">Shared-home plans</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{q.data.proposals.filter((p) => p.status === "pending" || p.status === "proposed").length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Awaiting decisions</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">A home changes only when everyone required agrees. Dating, affection or relationship scores never move someone in automatically.</p>
        </div>
      )}
      {!character && (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <button
              className="min-h-11 underline"
              onClick={openEdit}
              disabled={!home?.canEdit || busy}
            >
              Edit home
            </button>
            <button
              className="min-h-11 underline"
              onClick={() => {
                setMoving(!moving);
                setEdit(false);
                setLabel("My next home");
              }}
            >
              Move / arrange a stay
            </button>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={q.data.adultConfirmed}
              disabled={busy}
              onChange={(e) =>
                void act({
                  command: "adult_confirmation",
                  payload: { confirmed: e.target.checked },
                })
              }
            />
            I am an adult (18+) — required for shared housing proposals.
          </label>
          {home &&
            q.data.members
              .filter((m) => m.residence_id === home.id)
              .map((m) => (
                <p key={`${m.person_key}:${m.kind}`} className="text-sm">
                  {m.label} · {m.relation} · {m.kind}
                  {m.expires_at ? ` until ${new Date(m.expires_at).toLocaleDateString()}` : ""}
                </p>
              ))}
          {(edit || moving) && (
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (edit) {
                  void act({ command: "set_home", payload: details() });
                  return;
                }
                try {
                  const startsAt = date ? easternInstant(date, time).toISOString() : null,
                    endsAt =
                      temporary && endDate ? easternInstant(endDate, endTime).toISOString() : null;
                  const payload = {
                    movers: ["user", ...(companion ? [companion] : [])],
                    startsAt,
                    endsAt,
                    kind: temporary ? ("temporary" as const) : ("move" as const),
                    purpose,
                  };
                  void act(
                    destination === "new"
                      ? { command: "new_home", payload: { ...details(), ...payload } }
                      : { command: "propose_move", payload: { ...payload, place: destination } },
                  );
                } catch (e) {
                  setStatus(e instanceof Error ? e.message : "Check the move date");
                }
              }}
            >
              {moving && (
                <>
                  <label>
                    Destination
                    <select
                      className={field}
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                    >
                      <option value="new">New fictional residence</option>
                      {q.data.homes.map((h) => (
                        <option key={h.key} value={h.key}>
                          {h.label} · {h.community}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Move with
                    <select
                      className={field}
                      value={companion}
                      onChange={(e) => setCompanion(e.target.value)}
                    >
                      <option value="">Just me</option>
                      {contacts.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.name} — must agree
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Arrangement between residents
                    <select
                      className={field}
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                    >
                      {["individual", "roommates", "partners", "family", "friends"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={temporary}
                      onChange={(e) => setTemporary(e.target.checked)}
                    />
                    Temporary stay
                  </label>
                  <label>
                    Move date (Eastern)
                    <input
                      className={field}
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required={temporary}
                    />
                  </label>
                  <label>
                    Time (Eastern)
                    <input
                      className={field}
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      required
                    />
                  </label>
                  {temporary && (
                    <>
                      <label>
                        Stay ends
                        <input
                          className={field}
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        End time (Eastern)
                        <input
                          className={field}
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          required
                        />
                      </label>
                    </>
                  )}
                </>
              )}
              {(edit || destination === "new") && (
                <>
                  <label>
                    Home label
                    <input
                      className={field}
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      maxLength={100}
                      required
                    />
                  </label>
                  <label>
                    Community
                    <select
                      className={field}
                      value={community}
                      onChange={(e) => setCommunity(e.target.value as typeof community)}
                    >
                      {["Altoona", "Hollidaysburg", "Tyrone", "Duncansville"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Housing
                    <select
                      className={field}
                      value={type}
                      onChange={(e) => setType(e.target.value as typeof type)}
                    >
                      {housingTypes.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tenure
                    <select
                      className={field}
                      value={arrangement}
                      onChange={(e) => setArrangement(e.target.value as typeof arrangement)}
                    >
                      {housingArrangements.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label className="sm:col-span-2">
                    Description
                    <textarea
                      className={field}
                      maxLength={500}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                  {edit && (
                    <>
                      <label>
                        Fictional address (optional; blank preserves stored address)
                        <input
                          className={field}
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          maxLength={160}
                        />
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={exact}
                          onChange={(e) => setExact(e.target.checked)}
                        />
                        Display my exact virtual address
                      </label>
                    </>
                  )}
                </>
              )}
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Virtual housing only. No GPS. A shared home requires explicit agreement from every
                necessary resident. Past plans keep their original venue. Selecting an arrangement
                does not create romance or consent.
              </p>
              <button
                disabled={busy}
                className="min-h-11 rounded-full bg-primary px-4 text-primary-foreground"
              >
                {busy ? "Saving…" : edit ? "Save home" : "Propose move / stay"}
              </button>
              <button
                type="button"
                className="min-h-11 underline"
                onClick={() => {
                  setEdit(false);
                  setMoving(false);
                }}
              >
                Cancel
              </button>
            </form>
          )}
          {home && (
            <details>
              <summary className="min-h-11 cursor-pointer">Home privacy & invitations</summary>
              <p className="mb-2 text-xs text-muted-foreground">
                Share an address separately from permission to visit. A visit invitation lasts one
                day. An agreed plan can grant access during its visit window.
              </p>
              <label>
                Contact
                <select
                  className={field}
                  value={viewer}
                  onChange={(e) => setViewer(e.target.value)}
                >
                  <option value="">Choose a contact</option>
                  {contacts.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {["visit", "address"].map((permission) => (
                  <span key={permission} className="flex gap-2">
                    <button
                      disabled={busy || !viewer}
                      className="min-h-11 rounded-full border px-3 text-sm"
                      onClick={() =>
                        void act({
                          command: "disclose",
                          payload: {
                            place: home.key,
                            viewer,
                            permission: permission as "visit" | "address",
                          },
                        })
                      }
                    >
                      Share {permission}
                    </button>
                    <button
                      disabled={busy || !viewer}
                      className="min-h-11 underline text-sm"
                      onClick={() =>
                        void act({
                          command: "revoke",
                          payload: {
                            place: home.key,
                            viewer,
                            permission: permission as "visit" | "address",
                          },
                        })
                      }
                    >
                      Revoke {permission}
                    </button>
                  </span>
                ))}
              </div>
              <button
                disabled={busy}
                className="mt-4 min-h-11 text-sm text-destructive underline"
                onClick={() => {
                  if (
                    window.confirm(
                      "Remove your primary virtual home? Past locations, conversations and plans remain saved.",
                    )
                  )
                    void act({
                      command: "remove_home",
                      payload: { confirmation: "REMOVE MY VIRTUAL HOME" },
                    });
                }}
              >
                Remove primary home
              </button>
            </details>
          )}
        </>
      )}
      {q.data.proposals
        .filter((p) => !character || p.required.includes(character))
        .filter((p) => !["completed", "declined", "cancelled"].includes(p.status))
        .map((p) => (
          <article key={p.id} className="rounded-xl border p-3 text-sm">
            <h3 className="font-medium">
              {p.kind === "temporary" ? "Temporary stay" : "Move"} · {p.homeLabel}
            </h3>
            <p>
              {p.status} ·{" "}
              {p.starts_at
                ? new Date(p.starts_at).toLocaleString("en-US", { timeZone: "America/New_York" })
                : "Date needed"}{" "}
              Eastern
            </p>
            <div className="my-2 flex flex-wrap gap-2">
              <label>
                Set / propose date (Eastern)
                <input
                  className={field}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                Time
                <input
                  className={field}
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
            <p>
              {Object.entries(p.responses)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </p>
            {p.status === "needs_review" ? (
              <div>
                <p role="status">
                  Household, adult eligibility or commitments need review. Resolve missing consent
                  or eligibility, then make a new proposal.
                </p>
                {p.initiator === "user" && (
                  <button
                    className="min-h-11 underline"
                    disabled={busy}
                    onClick={() =>
                      void act({
                        command: "cancel",
                        payload: { proposalId: p.id, version: p.version },
                      })
                    }
                  >
                    Cancel this proposal
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-3">
                {p.required.includes("user") && (
                  <>
                    <button
                      disabled={busy}
                      className="min-h-11 underline"
                      onClick={() =>
                        void act({
                          command: "respond",
                          payload: {
                            proposalId: p.id,
                            version: p.version,
                            accept: true,
                            ...(date ? { startsAt: easternInstant(date, time).toISOString() } : {}),
                          },
                        })
                      }
                    >
                      Agree
                    </button>
                    <button
                      disabled={busy}
                      className="min-h-11 underline"
                      onClick={() =>
                        void act({
                          command: "respond",
                          payload: { proposalId: p.id, version: p.version, accept: false },
                        })
                      }
                    >
                      Decline
                    </button>
                  </>
                )}
                {p.initiator === "user" && (
                  <button
                    disabled={busy}
                    className="min-h-11 underline"
                    onClick={() =>
                      void act({
                        command: "cancel",
                        payload: { proposalId: p.id, version: p.version },
                      })
                    }
                  >
                    Cancel proposal
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      {!character && (
        <details>
          <summary className="min-h-11 cursor-pointer">Housing history</summary>
          {q.data.history.map((h) => (
            <p key={h.id} className="py-2 text-sm">
              {h.homeLabel} · {h.community} · {h.relation}
              <br />
              {new Date(h.startedAt).toLocaleDateString()} —{" "}
              {h.endedAt ? new Date(h.endedAt).toLocaleDateString() : "current"}
            </p>
          ))}
        </details>
      )}
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </section>
  );
}
