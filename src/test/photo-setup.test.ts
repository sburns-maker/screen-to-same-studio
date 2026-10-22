import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), list: vi.fn(), registry: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: mocks.registry };
      return q;
    },
    storage: { from: () => ({ list: mocks.list }) },
  },
}));
import { photoSetupStatus } from "@/lib/photo-setup.server";

beforeEach(() => {
  for (const key of [
    "OPENAI_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_URL",
    "ENABLE_DEV_PHOTO_ACTIONS",
    "DEVELOPER_PHOTO_USER_IDS",
  ])
    vi.stubEnv(key, "");
  mocks.registry.mockReset().mockResolvedValue({ data: null, error: null });
  mocks.rpc.mockReset();
  mocks.list.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("browser photo setup checks", () => {
  it("shows the signed-in account ID and missing bindings without credentials or network calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const status = await photoSetupStatus("my-user-id");
    expect(status.userId).toBe("my-user-id");
    expect(status.keyPresent).toBe(false);
    expect(status.migration).toBe("not checked");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reads approved references with bundled defaults and a no-write migration probe, never a paid generation", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-private-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    vi.stubEnv("SUPABASE_URL", "https://test.invalid");
    mocks.rpc.mockResolvedValue({ data: { version: 1 }, error: null });
    mocks.list.mockResolvedValue({ data: [{ name: "canonical.jpg" }], error: null });
    const status = await photoSetupStatus("my-user-id");
    expect(status.migration).toBe("present");
    expect(status.tessReference).toBe("present");
    expect(status.canonicalReferences).toHaveLength(5);
    expect(status.canonicalReferences.every((ref) => ref.status === "structurally_usable")).toBe(
      true,
    );
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("deliver_photo_turn", { p_job_id: null });
    expect(JSON.stringify(status)).not.toMatch(/test-only-private-key|test-service-key/);
  });
  it("distinguishes a missing migration from an inaccessible database", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    vi.stubEnv("SUPABASE_URL", "https://test.invalid");
    mocks.rpc.mockResolvedValue({ error: { code: "PGRST202" } });
    mocks.list.mockResolvedValue({ data: [], error: null });
    expect((await photoSetupStatus("user")).migration).toBe("missing");
    mocks.rpc.mockResolvedValue({ error: { code: "network_error" } });
    expect((await photoSetupStatus("user")).migration).toBe("unavailable");
  });
  it("restricts model access checks to allowlisted developers and sanitizes API failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("private upstream details", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(photoSetupStatus("user", true)).rejects.toThrow("disabled");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("ENABLE_DEV_PHOTO_ACTIONS", "true");
    vi.stubEnv("DEVELOPER_PHOTO_USER_IDS", "user");
    vi.stubEnv("OPENAI_API_KEY", "test-only-key");
    const status = await photoSetupStatus("user", true);
    expect(status.modelAccess).toBe("unavailable");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.openai.com/v1/models/gpt-6-luna");
    expect(JSON.stringify(status)).not.toMatch(/private upstream details|test-only-key/);
  });
});
