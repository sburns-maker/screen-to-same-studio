import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ check: vi.fn(), diagnose: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock("@/lib/living-experiences.functions", () => ({
  experienceProviderCheck: mocks.check,
  experienceDiagnostics: mocks.diagnose,
}));
import { LivingExperiencesDebug } from "@/components/LivingExperiencesDebug";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("does not run a paid check on mount, requires a deliberate click and disables duplicate clicks", async () => {
  let resolve!: (v: unknown) => void;
  mocks.check.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(<LivingExperiencesDebug conversationId="owned" />);
  expect(mocks.check).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Run one provider check (uses text AI)" }));
  expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  expect(mocks.check).toHaveBeenCalledWith({ data: { conversationId: "owned" } });
  resolve({
    state: "failed",
    diagnostic: {
      statusCode: 400,
      model: "gpt-6-luna",
      code: "request_invalid",
      hint: "schema_rejected",
      providerCode: null,
      param: null,
      requestId: "req_safe",
    },
    note: "No outing changed",
  });
  expect(await screen.findByRole("status")).toHaveTextContent("schema_rejected");
  expect(mocks.check).toHaveBeenCalledTimes(1);
});
