import { describe, it, expect } from "vitest";
import {
  experienceFailure,
  experienceFailureMessage,
  readExperienceFailure,
} from "@/lib/experience-failure";
describe("sanitized durable experience failures", () => {
  it("distinguishes model response failure from scheduling validation", () => {
    expect(
      experienceFailure(
        new Error("Character AI is temporarily unavailable; please try again later"),
        "generation",
      ),
    ).toMatchObject({ phase: "generation", code: "model_unavailable" });
    expect(
      experienceFailure(
        new Error("Calendar acceptance requires exact current user evidence"),
        "schedule_actions",
      ),
    ).toMatchObject({ phase: "schedule_actions", code: "calendar_action_invalid" });
  });
  it.each([402, 403])(
    "preserves the safe %s status for the world spending circuit breaker",
    (status) => {
      expect(
        experienceFailureMessage(
          experienceFailure(new Error(`Character AI access unavailable (${status})`), "generation"),
        ),
      ).toContain(String(status));
    },
  );
  it("does not expose arbitrary errors or persisted messages", () => {
    const failure = experienceFailure(
      new Error("secret provider payload and transcript"),
      "commit",
    );
    expect(experienceFailureMessage(failure)).not.toContain("secret");
    expect(experienceFailureMessage(failure)).toContain("Step: commit");
    expect(readExperienceFailure({ ...failure, message: "secret" })).toEqual(failure);
    expect(readExperienceFailure({ ...failure, code: "secret" })).toBeNull();
    expect(readExperienceFailure({ ...failure, phase: "secret" })).toBeNull();
    expect(readExperienceFailure(null)).toBeNull();
  });
});

it("keeps non-retryable provider reasons across persistence without exposing raw error fields", async () => {
  const { CharacterAIError, characterAIDiagnostic } = await import("@/lib/character-ai-error");
  const diagnostic = characterAIDiagnostic(
    "gpt-6-luna",
    400,
    { error: { code: "invalid_json_schema", param: "text.format.schema", message: "PRIVATE" } },
    "req_safe",
  );
  const failure = experienceFailure(new CharacterAIError("generic", diagnostic), "generation");
  expect(failure).toMatchObject({
    code: "model_request_invalid",
    diagnostic: { statusCode: 400, retryable: false },
  });
  expect(readExperienceFailure(JSON.parse(JSON.stringify(failure)))).toEqual(failure);
  expect(experienceFailureMessage(failure)).toContain("before retrying");
  expect(JSON.stringify(failure)).not.toContain("PRIVATE");
  expect(
    readExperienceFailure({ version: 1, phase: "generation", code: "model_unavailable" }),
  ).toEqual({ version: 1, phase: "generation", code: "model_unavailable" });
});
