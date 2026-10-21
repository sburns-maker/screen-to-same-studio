import { createFileRoute, Link } from "@tanstack/react-router";
import tess from "@/assets/tess.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tess — A realistic texting simulator" },
      { name: "description", content: "Practice real flirting and dating conversation with Tess, one persistent fictional person with her own life and opinions." },
      { property: "og:title", content: "Tess — A realistic texting simulator" },
      { property: "og:description", content: "One persistent fictional person. Realistic texting. Honest debriefs." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <div className="flex flex-1 flex-col justify-center py-10">
        <img src={tess} alt="Tess" width={512} height={512} className="h-20 w-20 rounded-full object-cover" />
        <h1 className="mt-8 font-display text-7xl leading-none tracking-tight">Tess</h1>
        <p className="mt-2 font-display text-xl italic text-muted-foreground">A realistic texting simulator</p>
        <p className="mt-10 text-[15px] leading-relaxed text-foreground/85">
          You met Tess at trivia a couple weeks ago. You talked for almost an hour and exchanged numbers. She seemed
          interested enough to keep talking, but neither of you has defined anything.
        </p>
      </div>
      <div className="pb-6">
        <Link
          to="/chat"
          className="flex h-13 w-full items-center justify-center rounded-full bg-primary py-4 text-[15px] font-semibold text-primary-foreground transition-opacity active:opacity-80"
        >
          Open conversation
        </Link>
        <p className="mt-4 text-center text-xs text-muted-foreground">Tess is fictional. She's not obligated to like you.</p>
      </div>
    </main>
  );
}
