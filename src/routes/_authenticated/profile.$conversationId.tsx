import { ContactPending } from "@/components/ContactPending";
import { HousingPanel } from "@/components/HousingPanel";
import { CallButton } from "@/components/CallButton";
import { contactPhoneNumber } from "@/lib/phone-calls";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { PhotoViewer } from "@/components/PhotoViewer";
import { ProfilePhotoPanel } from "@/components/ProfilePhotoPanel";
import { usePortraits } from "@/lib/use-portrait";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronRight,
  Image as ImageIcon,
  Search,
  Settings as SettingsIcon,
  User,
} from "lucide-react";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { Switch } from "@/components/ui/switch";
import { conversationQuery } from "@/lib/tess-queries";
import { updateSettings } from "@/lib/tess.functions";
import { characterFor } from "@/lib/characters";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/profile/$conversationId")({
  head: () => ({
    meta: [
      { title: "Contact info — Chats" },
      { name: "description", content: "Contact details." },
      { property: "og:title", content: "Contact info — Chats" },
      { property: "og:description", content: "Contact details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Profile,
});

function Profile() {
  const portraits = usePortraits();
  const { conversationId } = Route.useParams();
  const qc = useQueryClient();
  const conv = useQuery(conversationQuery(conversationId));
  const update = useServerFn(updateSettings);
  const characterKey = (conv.data?.character as { key?: string } | null)?.key;
  const def = characterFor(characterKey);

  async function set(patch: {
    real_time_mode?: boolean;
    muted?: boolean;
    mature_photography?: boolean;
  }) {
    try {
      await update({ data: { conversationId, ...patch } });
      await qc.invalidateQueries({ queryKey: ["conversation"] });
      await qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch {
      toast.error("Couldn't save this preference. Please try again.");
    }
  }

  if (!characterKey) return <ContactPending conversationId={conversationId} failed={!!conv.error || !conv.isPending} retry={() => void conv.refetch()} />;

  return (
    <>
      <ScreenHeader
        title="Contact info"
        backTo="/chat/$conversationId"
        backParams={{ conversationId }}
      />
      <Screen>
        <HousingPanel character={def.key}/>
        <div className="flex flex-col items-center text-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label={`${def.preferredName} profile photo options`}>
                <img
                  src={portraits.data?.[def.key] ?? def.avatar}
                  alt={def.fullName}
                  width={1024}
                  height={1024}
                  className="h-36 w-36 rounded-full object-cover"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <PhotoViewer
                  src={portraits.data?.[def.key] ?? def.avatar}
                  alt={`${def.preferredName} profile photo`}
                >
                  View photo
                </PhotoViewer>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => window.dispatchEvent(new Event("change-profile-photo"))}
              >
                Change photo
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/photos/$conversationId" params={{ conversationId }}>
                  Choose from shared media
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <h2 className="mt-4 font-display text-4xl">{def.fullName}</h2>
          <p className="text-sm text-muted-foreground">{def.pronouns}</p>
        </div>

        <section className="mx-auto mb-5 flex max-w-xl items-center justify-between gap-3 px-5">
          <div>
            <p className="text-sm">{contactPhoneNumber(def.key)}</p>
            <Link to="/calls" search={{ conversation: conversationId }} className="text-xs underline">
              Calls & recents
            </Link>
          </div>
          <CallButton conversationId={conversationId} name={def.preferredName} />
        </section>
        <ProfilePhotoPanel character={def.key} canonical={def.avatar} />
        <div className="mt-6 grid grid-cols-4 gap-2">
          {[
            { icon: User, label: "Profile", to: `/profile/$conversationId` },
            { icon: ImageIcon, label: "Media", to: `/photos/$conversationId` },
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
        <p className="mt-6 rounded-2xl border border-dashed p-4 text-sm leading-relaxed text-muted-foreground">
          {def.profileBlurb}
        </p>

        <div className="mt-4 divide-y rounded-2xl bg-surface">
          {def.age >= 18 && def.romanticCapable && (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-4 text-[15px]">
                <label htmlFor="mature-photography">Mature Photography</label>
                <Switch
                  id="mature-photography"
                  aria-label="Mature Photography"
                  disabled={!conv.data}
                  checked={!!conv.data?.mature_photography}
                  onCheckedChange={(v) => set({ mature_photography: v })}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Optional, non-explicit adult romantic portraits. No nudity. {def.preferredName}'s
                boundaries still apply.
              </p>
            </div>
          )}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-4 text-[15px]">
              Real-Time Mode
              <Switch
                checked={!!conv.data?.real_time_mode}
                onCheckedChange={(v) => set({ real_time_mode: v })}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {def.preferredName} follows their daily schedule — replies may take longer.
            </p>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-4 text-[15px]">
              Mute notifications
              <Switch
                checked={!!(conv.data as { muted?: boolean } | undefined)?.muted}
                onCheckedChange={(v) => set({ muted: v })}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Messages still arrive; you just won't be notified about this conversation.
            </p>
          </div>
        </div>

        {
          <Link
            to="/photos/$conversationId"
            params={{ conversationId }}
            className="mt-4 flex items-center justify-between rounded-2xl bg-surface px-4 py-3.5 text-[15px]"
          >
            Shared media <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        }
      </Screen>
    </>
  );
}
