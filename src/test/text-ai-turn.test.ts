import { describe, expect, it, vi } from "vitest";
import { SEED_STATE } from "@/lib/tess-logic";

const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tess.server", () => ({
  generateTessReply: generate,
  generateContactReply: generate,
}));
vi.mock("@/lib/tess-weather.server", () => ({ getWeatherContext: async () => null }));
vi.mock("@/lib/social.server", () => ({ knowledgeForCharacter: async () => [] }));
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
vi.mock("@/lib/storyline.server", () => ({
  storylineContext: async () => ({ lines: [], event: null }),
}));

describe("turn safety on provider failure", () => {
  it("coalesces overlapping calls, preserves pending replies/state/memories, and releases failed turns", async () => {
    const mutations = vi.fn();
    const supabase = {
      from(table: string) {
        const data =
          table === "conversations"
            ? {
                id: "conv",
                user_id: "user",
                character: { key: "tess" },
                difficulty: "realistic",
                photo_boundary: "none",
                photo_frequency: "normal",
              }
            : table === "tess_state"
              ? SEED_STATE
              : [];
        const query: Record<string, unknown> = {};
        for (const method of [
          "select",
          "or",
          "eq",
          "lte",
          "gt",
          "gte",
          "order",
          "limit",
          "single",
          "maybeSingle",
          "in",
        ])
          query[method] = () => query;
        for (const method of ["delete", "update", "insert"])
          query[method] = () => {
            mutations();
            return query;
          };
        query["then"] = (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data }).then(resolve);
        return query;
      },
    };
    generate.mockRejectedValue(new Error("Character AI is temporarily unavailable"));
    const { runTurn } = await import("@/lib/tess.functions");
    const client = supabase as unknown as Parameters<typeof runTurn>[0];
    const first = runTurn(client, "user", "conv", "America/New_York");
    const overlapping = runTurn(client, "user", "conv", "America/New_York");
    expect(overlapping).toBe(first);
    await expect(first).rejects.toThrow("temporarily unavailable");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(mutations).not.toHaveBeenCalled();
    await expect(runTurn(client, "user", "conv", "America/New_York")).rejects.toThrow(
      "temporarily unavailable",
    );
    expect(generate).toHaveBeenCalledTimes(2);
    expect(mutations).not.toHaveBeenCalled();
  });
});
