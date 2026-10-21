import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Tess" },
      { name: "description", content: "Sign in to continue your conversation with Tess." },
      { property: "og:title", content: "Sign in — Tess" },
      { property: "og:description", content: "Sign in to continue your conversation with Tess." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inbox" });
    });
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (s && e === "SIGNED_IN") navigate({ to: "/inbox" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/inbox" },
        });
        if (error) throw error;
        if (!data.session) setSent(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't sign in");
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "lovable") {
    const r = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(r.error.message ?? "Sign-in failed");
  }

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-5xl">Tess</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your conversation is private to your account.</p>

      {sent ? (
        <p className="mt-10 rounded-2xl bg-surface p-5 text-sm">Check your email to confirm your account, then come back here.</p>
      ) : (
        <>
          <div className="mt-10 space-y-3">
            <button type="button" className="lovable-auth-button w-full" onClick={() => oauth("lovable")}>
              Continue with Lovable
            </button>
            <Button variant="outline" className="h-11 w-full rounded-full" onClick={() => oauth("google")}>
              Continue with Google
            </Button>
          </div>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={submit} className="space-y-3">
            <Input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" />
            <Input type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl" />
            <Button type="submit" disabled={busy} className="h-11 w-full rounded-full">
              {mode === "in" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:underline">
            {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        </>
      )}
    </main>
  );
}
