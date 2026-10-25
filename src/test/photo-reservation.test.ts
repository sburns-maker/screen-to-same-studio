// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  failPhotoAction,
  inspectPhotoReservation,
  pendingPhotoResult,
  preparePhotoDelivery,
  recoverPhotoDelivery,
  reservePhotoAction,
} from "@/lib/photo-delivery.server";

const now = Date.parse("2026-10-25T14:00:00Z");
type Job = {
  id: string;
  status: string;
  job: string;
  started_at: string;
  detail: Record<string, unknown>;
};
function fixture(phase = "generating", age = 60_000) {
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const job: Job = {
    id: "action",
    status: "running",
    job: "photo-turn:c",
    started_at: new Date(now - age).toISOString(),
    detail: { userId: "u", conversationId: "c", phase, plan: { rows: [] } },
  };
  let race: (() => void) | undefined;
  const updates = vi.fn();
  const rpc = vi.fn(async (_name: string, args: { p_job_id: string | null }) => {
    if (!args.p_job_id) return { data: { version: 1 }, error: null };
    expect(job.detail["phase"]).toBe("prepared");
    job.status = "ok";
    return { data: { count: 1, lastVisibleAt: "2026-10-25T14:00:05Z" }, error: null };
  });
  const admin = {
    rpc,
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let mutation: Record<string, unknown> | undefined;
      const execute = () => {
        if (table === "conversations") return { data: { id: "c", user_id: "u" }, error: null };
        expect(table).toBe("job_runs");
        if (mutation && race) {
          const once = race;
          race = undefined;
          once();
        }
        const matches = filters.every(([key, value]) =>
          key.startsWith("detail->>")
            ? job.detail[key.slice(9)] === value
            : job[key as keyof Job] === value,
        );
        if (!matches) return { data: null, error: null };
        if (mutation) {
          updates(mutation);
          Object.assign(job, mutation);
        }
        return { data: { ...job }, error: null };
      };
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          return query;
        },
        update(values: Record<string, unknown>) {
          mutation = values;
          return query;
        },
        insert: async () => ({ error: { code: "23505" } }),
        maybeSingle: async () => execute(),
        then(resolve: (value: ReturnType<typeof execute>) => unknown) {
          return Promise.resolve(execute()).then(resolve);
        },
      };
      return query;
    },
  };
  return {
    admin: admin as never,
    job,
    rpc,
    updates,
    raceBeforeUpdate(fn: () => void) {
      race = fn;
    },
  };
}
afterEach(() => vi.restoreAllMocks());

describe("photo response reservation recovery", () => {
  it("shows read-only age/phase without leaking the saved response or calling a provider", async () => {
    const f = fixture();
    f.job.detail["plan"] = { rows: [{ body: "Private response", generated_path: "private/file" }] };
    const reservation = await inspectPhotoReservation(f.admin, "c", "u");
    expect(reservation).toMatchObject({ phase: "generating", ageSeconds: 60, recoverable: false });
    expect(JSON.stringify(reservation)).not.toContain("Private");
    expect(pendingPhotoResult(reservation!).reason).toContain("character response");
    expect(f.updates).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("does not expire an active request", async () => {
    const f = fixture();
    expect(await recoverPhotoDelivery(f.admin, "c", "u")).toMatchObject({
      reservation: { phase: "generating", recoverable: false },
    });
    expect(f.job.status).toBe("running");
    expect(f.updates).not.toHaveBeenCalled();
  });
  it("releases an expired generation with a conditional update, retaining its stable action", async () => {
    const f = fixture("generating", 301_000);
    expect(await recoverPhotoDelivery(f.admin, "c", "u")).toBeNull();
    expect(f.job).toMatchObject({ id: "action", status: "failed" });
    expect(await recoverPhotoDelivery(f.admin, "c", "u")).toBeNull();
    expect(f.updates).toHaveBeenCalledTimes(1);
    // Existing unique action cannot be charged again, even after release.
    expect(
      await reservePhotoAction(f.admin, { key: "same", conversationId: "c", userId: "u" }),
    ).toBeNull();
    expect(f.rpc).toHaveBeenCalledTimes(1); // Capability probe only, not delivery or generation.
  });
  it("delivers a response that became prepared during cleanup instead of destroying it", async () => {
    const f = fixture("generating", 301_000);
    f.raceBeforeUpdate(() => {
      f.job.detail["phase"] = "prepared";
    });
    expect(await recoverPhotoDelivery(f.admin, "c", "u")).toMatchObject({ count: 1 });
    expect(f.updates).not.toHaveBeenCalled();
    expect(f.job.status).toBe("ok");
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(await recoverPhotoDelivery(f.admin, "c", "u")).toBeNull();
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not change an action another worker already delivered", async () => {
    const f = fixture("generating", 301_000);
    f.raceBeforeUpdate(() => {
      f.job.status = "ok";
    });
    expect(await recoverPhotoDelivery(f.admin, "c", "u")).toBeNull();
    expect(f.job.status).toBe("ok");
    expect(f.updates).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each(["voice_prepared", "unexpected"])(
    "preserves %s even after five minutes",
    async (phase) => {
      const f = fixture(phase, 900_000);
      expect(await recoverPhotoDelivery(f.admin, "c", "u")).toMatchObject({
        count: 0,
        reservation: { recoverable: false },
      });
      expect(f.job.status).toBe("running");
      expect(f.updates).not.toHaveBeenCalled();
      expect(f.rpc).not.toHaveBeenCalled();
    },
  );
  it("rejects cross-owner reads and recovery before changing anything", async () => {
    const f = fixture("generating", 301_000);
    await expect(inspectPhotoReservation(f.admin, "c", "someone-else")).rejects.toThrow(
      "owner mismatch",
    );
    await expect(recoverPhotoDelivery(f.admin, "c", "someone-else")).rejects.toThrow(
      "owner mismatch",
    );
    expect(f.updates).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("rejects a late provider result after release instead of claiming it was prepared", async () => {
    const f = fixture("generating", 301_000);
    await recoverPhotoDelivery(f.admin, "c", "u");
    await expect(preparePhotoDelivery(f.admin, "action", "u", "c", {})).rejects.toThrow(
      "do not regenerate",
    );
    expect(f.job.status).toBe("failed");
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "reports actual attachment delivery independently from a text response (photo=%s)",
    async (photo) => {
      const f = fixture();
      const result = await preparePhotoDelivery(f.admin, "action", "u", "c", {
        rows: [{ id: "message", metadata: photo ? { generated_path: "private/asset.png" } : {} }],
        generated: photo ? { id: "generated" } : null,
      });
      expect(result).toMatchObject({ count: 1, photoSent: photo, imageRequested: photo });
    },
  );
  it("failure cleanup cannot overwrite an already prepared response", async () => {
    const f = fixture("prepared");
    await failPhotoAction(f.admin, "action");
    expect(f.job.status).toBe("running");
    expect(f.job.detail["phase"]).toBe("prepared");
    expect(f.updates).not.toHaveBeenCalled();
  });
});
