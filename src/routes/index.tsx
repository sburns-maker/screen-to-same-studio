import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import tess from "@/assets/tess.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Chats" },
      { name: "description", content: "Practice real conversation with persistent fictional people who have their own lives and opinions." },
      { property: "og:title", content: "Chats" },
      { property: "og:description", content: "Persistent fictional people. Realistic texting. Honest debriefs." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  // Normal launches go straight to the inbox. Onboarding shows only for
  // signed-out visitors or when explicitly replayed from Settings.
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/inbox", replace: true });
    });
  }, [navigate]);

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <div className="flex flex-1 flex-col justify-center py-10">
        <img src={tess} alt="Tess" width={512} height={512} className="h-20 w-20 rounded-full object-cover" />
        <h1 className="mt-8 font-display text-7xl leading-none tracking-tight">Chats</h1>
        <p className="mt-2 font-display text-xl italic text-muted-foreground">A realistic texting simulator</p>
        <p className="mt-10 text-[15px] leading-relaxed text-foreground/85">
          Everyone in this app is fictional. You'll text people with their own lives, schedules, moods and opinions —
          starting with Tess, who you met at trivia a couple weeks ago. They text back like real people: sometimes fast,
          sometimes not at all. Nobody is obligated to like you.
        </p>
      </div>
      <div className="pb-6">
        <Link
          to="/inbox"
          className="flex h-13 w-full items-center justify-center rounded-full bg-primary py-4 text-[15px] font-semibold text-primary-foreground transition-opacity active:opacity-80"
        >
          Open Chats
        </Link>
        <p className="mt-4 text-center text-xs text-muted-foreground">All contacts are fictional and AI-generated.</p>
      </div>
    </main>
  );
}
