import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/world-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { runWorldTick } = await import("@/lib/world.server");
        const report = await runWorldTick();
        let liveCallsClosed = 0;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { sweepOverdueLiveCalls } = await import("@/lib/live-calls.server");
          liveCallsClosed = await sweepOverdueLiveCalls(supabaseAdmin);
        } catch {
          console.warn("live call sweep skipped");
        }
        return Response.json({ ...report, liveCallsClosed });
      },
    },
  },
});
