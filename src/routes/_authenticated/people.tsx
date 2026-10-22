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
  const portraits = usePortraits();
  const q = useTown(),
    load = useServerFn(inboxOverview),
    contacts = useQuery({ queryKey: ["inbox"], queryFn: () => load({}) });
  return (
    <TownLayout title="Familiar faces" kicker="People" error={q.error} loading={q.isLoading}>
      <p className="mb-5 text-sm text-muted-foreground">
        Knowing someone and having their number are different things. Your existing connections are
        preserved.
      </p>
      <div className="space-y-3">
        {contacts.data?.map((c) => (
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
                Messaging contact · View your relationship
              </p>
            </div>
          </Link>
        ))}
        {q.data?.people
          .filter((n) => n.connection || n.introduction)
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
                {n.interests.join(" · ")} · Photos unavailable until an identity portrait is
                approved
              </p>
            </Link>
          ))}
      </div>
      <Link to="/explore" className="mt-6 block rounded-full border p-3 text-center text-sm">
        Meet someone along the way
      </Link>
    </TownLayout>
  );
}
