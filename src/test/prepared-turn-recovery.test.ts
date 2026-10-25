// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { recoverPhotoDelivery } from "@/lib/photo-delivery.server";

describe("prepared turn recovery", () => {
  it("replays prepared text even when current character availability would differ", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { count: 1, lastVisibleAt: "2026-10-25T08:03:00Z" }, error: null });
    const admin = {
      rpc,
      from(table: string) {
        if (table === "job_runs") {
          return {
            select(cols: string) {
              if (cols === "id, detail, started_at") {
                const query = { eq() { return query; }, maybeSingle: async () => ({
                  data: { id: "a", started_at: "2026-10-25T08:00:00Z", detail: { userId: "u", phase: "prepared", plan: { rows: [] } } },
                  error: null,
                }) };
                return query;
              }
              const query = { eq() { return query; }, maybeSingle: async () => ({ data: { detail: { plan: { rows: [] } } }, error: null }) };
              return query;
            },
          };
        }
        if (table === "conversations") {
          const q = { eq() { return q; }, select() { return q; }, maybeSingle: async () => ({
            data: { difficulty: "realistic", character: { key: "riley" } }, error: null,
          }) };
          return q;
        }
        throw new Error("Unexpected table: " + table);
      },
    };
    await expect(recoverPhotoDelivery(admin as never, "c", "u")).resolves.toMatchObject({ count: 1 });
    expect(rpc).toHaveBeenCalledWith("deliver_photo_turn", { p_job_id: "a" });
  });
});
