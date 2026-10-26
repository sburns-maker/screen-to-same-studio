import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CharacterAIError, characterAIDiagnostic } from "@/lib/character-ai-error";
const mocks = vi.hoisted(() => ({
  allowed: true,
  owned: true,
  run: vi.fn(),
  budget: vi.fn(),
  jobs: new Map<string, { status: string; detail: unknown }>(),
  tables: [] as string[],
}));
vi.mock("@/lib/spontaneous-photo.server", () => ({ developerPhotosAllowed: () => mocks.allowed }));
vi.mock("@/lib/world-runtime.server", () => ({ reserveWorldAi: mocks.budget }));
vi.mock("@/lib/text-ai.server", () => ({ runStructured: mocks.run }));
import { checkExperienceProvider } from "@/lib/experience-provider-check.server";
function db() {
  return {
    from: (table: string) => {
      mocks.tables.push(table);
      let id = "",
        job = "",
        action = "read",
        value: { id?: string; job?: string; status: string; detail: unknown };
      const q = {
        select: () => q,
        eq: (key: string, v: string) => {
          if (key === "id") id = v;
          if (key === "job") job = v;
          return q;
        },
        maybeSingle: () => q,
        insert: (v: typeof value) => {
          action = "insert";
          value = v;
          id = v.id!;
          return q;
        },
        update: (v: typeof value) => {
          action = "update";
          value = v;
          return q;
        },
        then: (resolve: (value: unknown) => unknown) => {
          if (table === "conversations")
            return Promise.resolve({
              data: mocks.owned ? { id: "conversation" } : null,
              error: null,
            }).then(resolve);
          const key = id;
          void job;
          if (action === "insert") {
            if (mocks.jobs.has(key))
              return Promise.resolve({ data: null, error: { code: "23505" } }).then(resolve);
            mocks.jobs.set(key, value);
          }
          if (action === "update") mocks.jobs.set(key, value);
          return Promise.resolve({
            data: action === "read" ? (mocks.jobs.get(key) ?? null) : null,
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
  } as never;
}
beforeEach(() => {
  mocks.allowed = true;
  mocks.owned = true;
  mocks.jobs.clear();
  mocks.tables.length = 0;
  mocks.run.mockReset().mockResolvedValue({});
  mocks.budget.mockReset().mockResolvedValue(true);
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  vi.stubEnv("CHARACTER_AI_DISABLED", "false");
});
afterEach(() => vi.unstubAllEnvs());
const now = new Date("2026-10-26T22:00:00Z");
it("makes exactly one isolated request, reads its saved result on repeat, and never touches outings/messages/relationships", async () => {
  expect((await checkExperienceProvider(db(), "owner", "conversation", now)).state).toBe("passed");
  expect((await checkExperienceProvider(db(), "owner", "conversation", now)).state).toBe("passed");
  expect(mocks.run).toHaveBeenCalledTimes(1);
  expect(mocks.budget).toHaveBeenCalledTimes(1);
  expect(new Set(mocks.tables)).toEqual(new Set(["conversations", "job_runs"]));
  expect(JSON.stringify(mocks.run.mock.calls)).not.toContain("Juniper");
});
it("retains a sanitized rejection and does not resubmit it on another click", async () => {
  mocks.run.mockRejectedValue(
    new CharacterAIError(
      "private",
      characterAIDiagnostic(
        "gpt-6-luna",
        400,
        { error: { message: "Unsupported parameter: 'reasoning.effort'. PRIVATE" } },
        "req_safe",
      ),
    ),
  );
  const result = await checkExperienceProvider(db(), "owner", "conversation", now);
  expect(result).toMatchObject({
    state: "failed",
    diagnostic: { hint: "unsupported_parameter", param: "reasoning.effort" },
  });
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
  await checkExperienceProvider(db(), "owner", "conversation", now);
  expect(mocks.run).toHaveBeenCalledTimes(1);
});
it("rejects unapproved developers and unowned conversations before any paid request", async () => {
  mocks.allowed = false;
  await expect(checkExperienceProvider(db(), "owner", "conversation", now)).rejects.toThrow(
    "Developer",
  );
  mocks.allowed = true;
  mocks.owned = false;
  await expect(checkExperienceProvider(db(), "other", "conversation", now)).rejects.toThrow(
    "Conversation",
  );
  expect(mocks.run).not.toHaveBeenCalled();
});
it("does not submit if the configured budget is exhausted", async () => {
  mocks.budget.mockResolvedValue(false);
  expect((await checkExperienceProvider(db(), "owner", "conversation", now)).state).toBe("blocked");
  expect(mocks.run).not.toHaveBeenCalled();
});

it("deduplicates simultaneous checks before either can submit a second provider request", async () => {
  await Promise.all([
    checkExperienceProvider(db(), "owner", "conversation", now),
    checkExperienceProvider(db(), "owner", "conversation", now),
  ]);
  expect(mocks.run).toHaveBeenCalledTimes(1);
  expect(mocks.budget).toHaveBeenCalledTimes(1);
});
it("blocks safely when budget storage is unavailable", async () => {
  mocks.budget.mockRejectedValue(new Error("private database failure"));
  const result = await checkExperienceProvider(db(), "owner", "conversation", now);
  expect(result.state).toBe("blocked");
  expect(JSON.stringify(result)).not.toContain("private");
  expect(mocks.run).not.toHaveBeenCalled();
});
