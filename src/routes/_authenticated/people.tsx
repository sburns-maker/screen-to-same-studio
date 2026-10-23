import { useState } from "react";
import { useInteractiveWorld } from "@/lib/use-interactive-world";
import { usePortraits } from "@/lib/use-portrait";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTown } from "@/lib/town-queries";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { inboxOverview } from "@/lib/tess.functions";
import { characterFor } from "@/lib/characters";
import { TownLayout, card } from "@/components/TownLayout";
export const Route = createFileRoute("/_authenticated/people")({ component: People });
function People() {
  const portraits = usePortraits(),
    world = useInteractiveWorld();
  const [tab, setTab] = useState("all"),
    [search, setSearch] = useState("");
  const q = useTown(),
    load = useServerFn(inboxOverview),
    contacts = useQuery({ queryKey: ["inbox"], queryFn: () => load({}) });
  return (
    <TownLayout title="Familiar faces" kicker="People" error={q.error} loading={q.isLoading}>
      <p className="mb-5 text-sm text-muted-foreground">
        Knowing someone and having their number are different things. Your existing connections are
        preserved.
      </p>
      <label className="mb-3 block text-sm">
        Find someone
        <input
          aria-label="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name or interest"
          className="mt-2 min-h-12 w-full rounded-2xl border bg-surface px-4"
        />
      </label>
      <div className="mb-5 flex gap-2 overflow-x-auto" aria-label="People filters">
        {[
          ["all", "Everyone you know"],
          ["contacts", "Contacts"],
          ["acquaintances", "Acquaintances"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => setTab(key!)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm ${tab === key ? "bg-primary text-primary-foreground" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>
      {contacts.error && (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          Messaging contacts could not load. Your contacts and conversations are still saved.
        </p>
      )}
      <div className="space-y-3">
        {contacts.data
          ?.filter(
            (c) => tab !== "acquaintances" && c.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((c) => (
            <Link
              key={c.id}
              to="/profile/$conversationId"
              params={{ conversationId: c.id }}
              className={`${card} flex items-center gap-3`}
            >
              <img
                src={portraits.data?.[c.characterKey] ?? characterFor(c.characterKey).avatar}
                alt=""
                className="h-12 w-12 rounded-full object-cover"
              />
              <div>
                <h2 className="font-medium">{c.name}</h2>
                <p className="text-xs text-muted-foreground">
                  Messaging contact · Profile & media gallery
                </p>
                {!!world.data?.plans.filter(
                  (p) => p.conversation_id === c.id && p.status === "completed",
                ).length && (
                  <p className="mt-1 text-xs text-primary">
                    {
                      world.data.plans.filter(
                        (p) => p.conversation_id === c.id && p.status === "completed",
                      ).length
                    }{" "}
                    recorded shared experience(s)
                  </p>
                )}
              </div>
            </Link>
          ))}
        {q.data?.people
          .filter(
            (n) =>
              (n.connection || n.introduction) &&
              (tab !== "contacts" || n.connection?.contact) &&
              (tab !== "acquaintances" || !n.connection?.contact) &&
              `${n.name} ${n.interests.join(" ")}`.toLowerCase().includes(search.toLowerCase()),
          )
          .map((n) => (
            <Link
              key={n.key}
              to={n.connection ? "/encounter/$npcKey" : "/place/$placeKey"}
              params={n.connection ? { npcKey: n.key } : { placeKey: n.place }}
              className={`${card} block`}
            >
              <h2 className="font-medium">{n.name}</h2>
              <p className="mt-1 text-xs text-primary">
                {n.connection?.contact
                  ? "Messaging contact"
                  : n.connection
                    ? "Met in person · Contact not exchanged"
                    : `Introduction from ${n.introduction?.source_character} · Meet at a public place`}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">{n.blurb}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {n.interests.join(" · ")} · Photos not shared yet
              </p>
            </Link>
          ))}
      </div>
      {search && (
        <p className="mt-4 text-xs text-muted-foreground">
          Only people you have met or been introduced to appear here. Try Explore for public
          encounters.
        </p>
      )}
      <Link to="/explore" className="mt-6 block rounded-full border p-3 text-center text-sm">
        Meet someone along the way
      </Link>
    </TownLayout>
  );
}
