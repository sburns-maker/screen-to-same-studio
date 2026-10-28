/** Stable fictional-service display aliases. They are NOT verified unassigned phone numbers.
 * Never use these values as carrier destinations, tel/sms links, database keys or consent.
 * Actual calling uses owned conversation IDs; real-number integration needs separate verified data.
 * Append future contacts explicitly so existing aliases never shift with cast ordering.
 */
export const CONTACT_DISPLAY_NUMBERS: Readonly<Record<string, string>> = Object.freeze({
  tess: "8146842739",
  maya: "8143178624",
  claire: "8146934528",
  jordan: "8142084916",
  ben: "8149326187",
  riley: "8145217063",
  sienna: "8146158027",
  "rowan-ellis": "8146312847",
  "leah-moss": "8147426031",
  "nolan-reed": "8145098263",
  "mira-dalton": "8144162958",
  "theo-finch": "8142736841",
  "inez-carter": "8148561392",
  "orla-june": "8143925176",
  "elliot-reed": "8146079432",
  "robin-hale": "8149253706",
  "dana-soler": "8144687195",
});
export function contactPhoneNumber(key: string): string | null {
  const digits = Object.hasOwn(CONTACT_DISPLAY_NUMBERS, key)
    ? CONTACT_DISPLAY_NUMBERS[key]
    : undefined;
  return digits ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : null;
}
