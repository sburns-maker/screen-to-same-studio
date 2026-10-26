import { expect, it } from "vitest";
import { CONTACT_DISPLAY_NUMBERS, contactPhoneNumber } from "@/lib/contact-numbers";
import { FICTIONAL_NUMBERS, fictionalNumber } from "@/lib/phone-calls";
it("assigns stable unique display aliases for all six main contacts and existing directory contacts", () => {
  const keys = [
    "tess",
    "maya",
    "claire",
    "jordan",
    "ben",
    "riley",
    ...Object.keys(FICTIONAL_NUMBERS),
  ];
  for (const key of keys) expect(contactPhoneNumber(key)).toMatch(/^\(814\) [2-9]\d{2}-\d{4}$/);
  const values = Object.values(CONTACT_DISPLAY_NUMBERS);
  expect(new Set(values).size).toBe(values.length);
  expect(Object.isFrozen(CONTACT_DISPLAY_NUMBERS)).toBe(true);
});
it("keeps display aliases separate from the existing service directory and future real carrier routing", () => {
  expect(contactPhoneNumber("maya")).toBe("(814) 317-8624");
  expect(fictionalNumber("maya")).toBe("(814) 555-0101");
  expect(fictionalNumber("riley")).toBeNull(); // Display aliases must not provision new calling capability.
  expect(contactPhoneNumber("unregistered")).toBeNull();
  expect(contactPhoneNumber("constructor")).toBeNull();
});
