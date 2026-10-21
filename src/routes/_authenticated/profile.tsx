import { createFileRoute } from "@tanstack/react-router";
import tessImg from "@/assets/tess.jpg";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Tess Morgan — Profile" },
      { name: "description", content: "What you know about Tess so far." },
      { property: "og:title", content: "Tess Morgan — Profile" },
      { property: "og:description", content: "What you know about Tess so far." },
    ],
  }),
  component: Profile,
});

const facts: [string, string][] = [
  ["Age", "34"],
  ["Work", "Operations manager at a veterinary practice"],
  ["Lives", "Rents a townhouse, with her rescue dog Mabel"],
  ["Met", "Trivia night, two weeks ago"],
];

function Profile() {
  return (
    <>
      <ScreenHeader title="Contact info" />
      <Screen>
        <div className="flex flex-col items-center text-center">
          <img src={tessImg} alt="Tess" width={512} height={512} className="h-36 w-36 rounded-full object-cover" />
          <h2 className="mt-4 font-display text-4xl">Tess Morgan</h2>
          <p className="text-sm text-muted-foreground">she/her</p>
        </div>
        <dl className="mt-8 divide-y rounded-2xl bg-surface">
          {facts.map(([k, v]) => (
            <div key={k} className="flex gap-4 px-4 py-3.5 text-[15px]">
              <dt className="w-16 shrink-0 text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 rounded-2xl border border-dashed p-4 text-sm leading-relaxed text-muted-foreground">
          What you remember from trivia: funny, dry, a little guarded. Loves winter. Has opinions about coffee. Everything
          else you'll have to actually learn.
        </p>
        <p className="mt-6 text-center text-xs text-muted-foreground">Tess is a fictional character.</p>
      </Screen>
    </>
  );
}
