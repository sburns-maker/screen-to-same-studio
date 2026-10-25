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
