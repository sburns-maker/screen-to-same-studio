import { IncomingCall } from "@/components/IncomingCall";
import { WorldNavigation } from "@/components/WorldNavigation";
import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedShell,
});

function AuthenticatedShell() {
  const path = useLocation().pathname;
  const thread = /^\/(chat|encounter)\//.test(path);
  return (
    <>
      <div className={thread ? "" : "pb-20"}>
        <Outlet />
      </div>
      <WorldNavigation />
      {!/^\/call\//.test(path) && <IncomingCall />}
    </>
  );
}
