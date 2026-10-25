// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { preparePhotoDelivery } from "@/lib/photo-delivery.server";

afterEach(() => vi.restoreAllMocks());

describe("photo delivery RPC diagnostics", () => {
  it("keeps the prepared outbox for retry and logs the database error code", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let preparedDetail: unknown;
    const admin = {
      from(table: string) {
        expect(table).toBe("job_runs");
        return {
          update(values: { detail: unknown }) {
            preparedDetail = values.detail;
            const chain = {
              eq() {
                return chain;
              },
              select() {
                return chain;
              },
              maybeSingle: async () => ({ data: { id: "reserved" }, error: null }),
            };
            return chain;
          },
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { detail: preparedDetail },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "23505", message: "duplicate key value violates unique constraint" },
      }),
    };
    await expect(
      preparePhotoDelivery(
        admin as never,
        "30000000-0000-4000-a000-000000000001",
        "10000000-0000-4000-a000-000000000001",
        "20000000-0000-4000-a000-000000000001",
        { rows: [], generated: null },
      ),
    ).rejects.toThrow("Photo delivery deferred; retry delivery without regenerating");
    expect(preparedDetail).toMatchObject({ phase: "prepared" });
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "[photo-delivery] deliver_photo_turn failed",
      expect.objectContaining({ code: "23505" }),
    );
  });
});
