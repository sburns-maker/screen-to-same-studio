import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateSchedule } from "@/lib/use-schedule";
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
  const { user } = Route.useRouteContext();
  const cache = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel("owned-calendar:" + user.id);
    for (const table of ["social_plans", "living_experiences"])
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${user.id}` },
        () => {
          void invalidateSchedule(cache);
        },
      );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cache, user.id]);
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
