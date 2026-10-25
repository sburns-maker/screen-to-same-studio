import { expect, it } from "vitest";
import { acceptsPlan } from "@/lib/calendar-contract";

it("recognizes Riley's explicit time agreement", () => {
  expect(acceptsPlan("4pm works! Sorry having some phone issues. How was the rest if your night")).toBe(true);
});
it("does not turn a conditional time into acceptance", () => {
  expect(acceptsPlan("4pm works if I get off work early")).toBe(false);
});
it("does not turn a rejected time into acceptance", () => {
  expect(acceptsPlan("4pm doesn't work")).toBe(false);
});