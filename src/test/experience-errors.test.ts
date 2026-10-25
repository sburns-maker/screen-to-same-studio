import { describe, it, expect } from "vitest";
import { experienceActionError } from "@/lib/experience-errors";
describe("experience action diagnostics", () => {
  it.each(["Experience changed; refresh", "Confirmed plan changed; refresh", "Stale generation"])(
    "explains a revision conflict: %s",
    (message) => {
      expect(experienceActionError(message)).toContain("changed while this screen was open");
    },
  );
  it("distinguishes active generation, pending recovery and moment limits", () => {
    expect(experienceActionError("A scene is still generating; retry shortly")).toContain(
      "still being prepared",
    );
    expect(experienceActionError("Retry the pending scene first")).toContain("Retry pending scene");
    expect(experienceActionError("Experience moment limit reached; finish the outing")).toContain(
      "scene limit",
    );
  });
  it("keeps unrecognized database details private", () => {
    const message = "SQL function secret internal schema failure";
    expect(experienceActionError(message)).not.toContain(message);
  });
});
