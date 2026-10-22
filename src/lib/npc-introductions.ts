import { TOWN_NPCS } from "./town";
export function introductionTargets(text: string) {
  return TOWN_NPCS.filter((n) => {
    const escaped = n.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (
      new RegExp(
        `(?:you should meet|I can introduce you to|I'd like you to meet|I would like you to meet)\\s+${escaped}\\b`,
        "i",
      ).test(text) && !/(?:don't|do not|can't|cannot|never)\s+(?:meet|introduce)/i.test(text)
    );
  });
}
