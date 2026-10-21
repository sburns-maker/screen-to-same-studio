import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Image as ImageIcon, Search, Settings as SettingsIcon, User } from "lucide-react";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { conversationQuery } from "@/lib/tess-queries";
import { characterFor } from "@/lib/characters";

export const Route = createFileRoute("/_authenticated/profile/$conversationId")({
  head: () => ({
    meta: [
      { title: "Contact info — Chats" },
      { name: "description", content: "Contact details." },
      { property: "og:title", content: "Contact info — Chats" },
      { property: "og:description", content: "Contact details." },
    ],
  }),
  component: Profile,
});

function Profile() {
  const { conversationId } = Route.useParams();
  const conv = useQuery(conversationQuery(conversationId));
  const def = characterFor((conv.data?.character as { key?: string } | null)?.key);

  return (
    <>
      <ScreenHeader title="Contact info" backTo="/chat/$conversationId" backParams={{ conversationId }} />
      <Screen>
        <div className="flex flex-col items-center text-center">
          <img src={def.avatar} alt={def.fullName} width={1024} height={1024} className="h-36 w-36 rounded-full object-cover" />
          <h2 className="mt-4 font-display text-4xl">{def.fullName}</h2>
          <p className="text-sm text-muted-foreground">{def.pronouns}</p>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-2">
          {[
            { icon: User, label: "Profile", to: `/profile/$conversationId` },
            ...(def.photosEnabled ? [{ icon: ImageIcon, label: "Photos", to: `/photos/$conversationId` }] : []),
            { icon: Search, label: "Search", to: `/history/$conversationId` },
            { icon: SettingsIcon, label: "Settings", to: `/settings` },
          ].map((a) => (
            <Link
              key={a.label}
              to={a.to}
              {...(a.to.includes("$conversationId") ? { params: { conversationId } } : {})}
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface py-3 text-xs text-muted-foreground"
            >
              <a.icon className="h-5 w-5" />
              {a.label}
            </Link>
          ))}
        </div>

        <dl className="mt-6 divide-y rounded-2xl bg-surface">
          {def.knownFacts.map(([k, v]) => (
            <div key={k} className="flex gap-4 px-4 py-3.5 text-[15px]">
              <dt className="w-16 shrink-0 text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 rounded-2xl border border-dashed p-4 text-sm leading-relaxed text-muted-foreground">{def.profileBlurb}</p>

        {def.photosEnabled && (
          <Link
            to="/photos/$conversationId"
            params={{ conversationId }}
            className="mt-4 flex items-center justify-between rounded-2xl bg-surface px-4 py-3.5 text-[15px]"
          >
            Shared photos <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        )}
      </Screen>
    </>
  );
}
