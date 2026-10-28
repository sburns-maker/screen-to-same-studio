import { beforeEach, expect, it, vi } from "vitest";
import { commitmentSnapshot } from "@/lib/relationship-commitments.server";
const user = "10000000-0000-4000-8000-000000000001";
const fixture = {
  user_id: user,
  character_key: "riley",
  id: "20000000-0000-4000-8000-000000000001",
  kind: "partnership",
  proposed_by: "user",
  status: "pending",
  user_response: "accepted",
  character_response: "pending",
  occurred_at: "2026-10-28T12:00:00Z",
  source_id: "player:one",
  source_type: "manual",
  note: null,
};
let storageCode: string | null, syncCode: string | null, rows: unknown[], fallback: boolean;
const filters = vi.fn(),
  rpc = vi.fn();
function database() {
  return {
    from: () => {
      let head = false;
      const q = {
        select: (_fields: string, options?: { head?: boolean }) => {
          head = !!options?.head;
          return q;
        },
        eq: (...args: unknown[]) => {
          filters(...args);
          return q;
        },
        order: () => q,
        limit: async () =>
          head
            ? {
                error: storageCode
                  ? { code: storageCode, message: "private raw diagnostic" }
                  : null,
              }
            : { data: rows, error: null },
      };
      return q;
    },
    rpc,
  } as never;
}
beforeEach(() => {
  storageCode = null;
  syncCode = null;
  rows = [fixture];
  fallback = false;
  filters.mockClear();
  rpc.mockReset().mockImplementation(async (name: string) => ({
    error:
      name === "relationship_sync_tess" && fallback
        ? null
        : syncCode
          ? { code: syncCode, message: "private raw diagnostic" }
          : null,
  }));
});
it("reports missing storage without inventing an empty relationship history", async () => {
  storageCode = "42P01";
  const result = await commitmentSnapshot(database(), user, "riley");
  expect(result).toEqual({
    available: false,
    events: [],
    diagnostic: { phase: "storage", code: "42P01" },
  });
  expect(rpc).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain("private raw");
});
it("retains owned history when synchronization is unavailable and returns a bounded code", async () => {
  syncCode = "PGRST202";
  const result = await commitmentSnapshot(database(), user, "riley");
  expect(result.available).toBe(false);
  expect(result.events).toHaveLength(1);
  expect(result.diagnostic).toEqual({ phase: "sync", code: "PGRST202" });
  expect(filters).toHaveBeenCalledWith("user_id", user);
  expect(filters).toHaveBeenCalledWith("character_key", "riley");
  expect(rpc).toHaveBeenCalledWith("relationship_sync_character", {
    p_user: user,
    p_character: "riley",
  });
  expect(JSON.stringify(result)).not.toContain("private raw");
});
it("does not expose arbitrary backend errors", async () => {
  syncCode = "secret-diagnostic";
  expect((await commitmentSnapshot(database(), user, "riley")).diagnostic).toEqual({
    phase: "sync",
    code: "unavailable",
  });
});
it("still rejects a cross-character or cross-user row during a sync failure", async () => {
  syncCode = "42501";
  for (const patch of [{ character_key: "claire" }, { user_id: crypto.randomUUID() }]) {
    rows = [{ ...fixture, ...patch }];
    await expect(commitmentSnapshot(database(), user, "riley")).rejects.toThrow(
      "Relationship scope mismatch",
    );
  }
});
it("recovers normally after the backend becomes ready", async () => {
  syncCode = "42501";
  expect((await commitmentSnapshot(database(), user, "riley")).available).toBe(false);
  syncCode = null;
  const result = await commitmentSnapshot(database(), user, "riley");
  expect(result.available).toBe(true);
  expect(result.diagnostic).toBeUndefined();
  expect(result.events).toHaveLength(1);
});
it("keeps Tess's legacy fallback while reporting failures if both RPCs fail", async () => {
  rows = [{ ...fixture, character_key: "tess" }];
  syncCode = "PGRST202";
  fallback = true;
  expect((await commitmentSnapshot(database(), user, "tess")).available).toBe(true);
  fallback = false;
  expect((await commitmentSnapshot(database(), user, "tess")).available).toBe(false);
});
