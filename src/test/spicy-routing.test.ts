// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { canonicalProfile } from "@/lib/canonical-profile.server";
const mocks = vi.hoisted(() => ({ refs: vi.fn(), submit: vi.fn(), adult: true, spicyEnabled: true }));
vi.mock("@/lib/photo-reference-library.server", () => ({ approvedProviderReferences: mocks.refs }));
vi.mock("@/lib/spicy-jobs.server", () => ({ submitSpicyPhoto: mocks.submit }));
import { configuredPhotoProvider } from "@/lib/photo-provider-router.server";
import { SPICY_CAST, SPICY_MODELS } from "@/lib/spicy-image.server";
const normal = { name: "openai", model: "working", generate: vi.fn() };
const client = {
  from: () => {
    const q: { select: () => unknown; eq: () => unknown; maybeSingle: () => unknown } = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({
        data: { spicy_enabled: mocks.spicyEnabled, adult_confirmed: mocks.adult },
        error: null,
      }),
    };
    return q;
  },
} as unknown as SupabaseClient<Database>;
beforeEach(() => {
  for (const [k, v] of Object.entries({
    SPICY_ENABLED: "true",
    SPICY_API_KEY: "test",
    SPICY_ACCOUNT_CREDITS_VERIFIED_AT: new Date().toISOString(),
    SPICY_JOB_RESERVATION_CENTS: "10",
    SPICY_DAILY_BUDGET_CENTS: "100",
    SPICY_MONTHLY_BUDGET_CENTS: "1000",
  }))
    vi.stubEnv(k, v);
  mocks.adult = true;
  mocks.spicyEnabled = true;
  mocks.submit.mockReset().mockRejectedValue(new Error("queued-test"));
  mocks.refs.mockReset().mockImplementation(async (_db, _user, key) => [
    {
      url: `https://storage.example.com/${key}/canonical`,
      blob: (await canonicalProfile(key)).blob,
    },
  ]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it.each(SPICY_CAST)("uses only %s's approved canonical reference", async (key) => {
  const p = await configuredPhotoProvider(
    client,
    "owner",
    key,
    "mature_romantic",
    normal,
    "action",
    "conversation",
    { scene: "at home", expression: null },
  );
  expect(p).toMatchObject({ name: "spicyapi", model: SPICY_MODELS[0], allowIdentityRetry: false });
  await expect(p.generate("one adult", [(await canonicalProfile(key)).blob])).rejects.toThrow(
    "queued-test",
  );
  expect(mocks.refs).toHaveBeenCalledWith(client, "owner", key);
  expect(mocks.submit.mock.calls[0]![3]).toBe(key);
  expect(mocks.submit.mock.calls[0]![6]).toEqual([`https://storage.example.com/${key}/canonical`]);
});
it("rejects a wrong-character reference before submission", async () => {
  const p = await configuredPhotoProvider(
    client,
    "owner",
    "riley",
    "mature_romantic",
    normal,
    "action",
    "conversation",
    { scene: "at home", expression: null },
  );
  await expect(p.generate("scene", [(await canonicalProfile("maya")).blob])).rejects.toThrow(
    "identity_changed",
  );
  expect(mocks.submit).not.toHaveBeenCalled();
});
it("blocks missing adult confirmation without querying references", async () => {
  mocks.adult = false;
  await expect(
    configuredPhotoProvider(
      client,
      "owner",
      "tess",
      "mature_romantic",
      normal,
      "action",
      "conversation",
      { scene: "home", expression: null },
    ),
  ).rejects.toThrow("Adult");
  expect(mocks.refs).not.toHaveBeenCalled();
});
it("routes suggestive only to SpicyAPI when enabled and explicitly opted in", async () => {
  const provider = await configuredPhotoProvider(
    client, "owner", "maya", "suggestive", normal, "action", "conversation",
    { scene: "private portrait", expression: null, type: "suggestive" },
  );
  expect(provider.name).toBe("spicyapi");
  expect(provider.model).toBe(SPICY_MODELS[0]);
  await expect(provider.generate("fictional adult", [(await canonicalProfile("maya")).blob]))
    .rejects.toThrow("queued-test");
  expect(normal.generate).not.toHaveBeenCalled();
  expect(mocks.submit).toHaveBeenCalledOnce();
});
it("never falls back to OpenAI for suggestive when SpicyAPI is disabled", async () => {
  vi.stubEnv("SPICY_ENABLED", "false");
  await expect(configuredPhotoProvider(client, "owner", "maya", "suggestive", normal))
    .rejects.toThrow("Suggestive photos require SpicyAPI to be enabled");
  expect(normal.generate).not.toHaveBeenCalled();
  expect(mocks.refs).not.toHaveBeenCalled();
});
it("never falls back to OpenAI for suggestive when the character has not opted in", async () => {
  mocks.spicyEnabled = false;
  await expect(configuredPhotoProvider(client, "owner", "maya", "suggestive", normal))
    .rejects.toThrow("Enable SpicyAPI for this character");
  expect(mocks.refs).not.toHaveBeenCalled();
  expect(normal.generate).not.toHaveBeenCalled();
});
it("never falls back to OpenAI for suggestive when SpicyAPI credits are unverified", async () => {
  vi.stubEnv("SPICY_ACCOUNT_CREDITS_VERIFIED_AT", "2020-01-01T00:00:00Z");
  await expect(configuredPhotoProvider(client, "owner", "maya", "suggestive", normal))
    .rejects.toThrow("Verify usable SpicyAPI account credit");
  expect(normal.generate).not.toHaveBeenCalled();
});
it("normal photos and a disabled provider keep OpenAI without old API18 calls", async () => {
  expect(await configuredPhotoProvider(client, "owner", "tess", "casual_selfie", normal)).toBe(
    normal,
  );
  vi.stubEnv("SPICY_ENABLED", "false");
  vi.stubEnv("API18_ENABLED", "true");
  expect(await configuredPhotoProvider(client, "owner", "tess", "mature_romantic", normal)).toBe(
    normal,
  );
  expect(mocks.refs).not.toHaveBeenCalled();
  expect(mocks.submit).not.toHaveBeenCalled();
});
