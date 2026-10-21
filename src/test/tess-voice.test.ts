import { describe, it, expect } from "vitest";
import { enforceTessVoice, cleanTessHistoryLine } from "@/lib/tess-voice";

describe("enforceTessVoice", () => {
  it("removes self-description of her personality", () => {
    const out = enforceTessVoice(["Sarcasm is basically my second language. Anyway, Mabel ate a sock."]);
    expect(out).toEqual(["Anyway, Mabel ate a sock."]);
  });
  it("drops presenter phrasing bubbles", () => {
    expect(enforceTessVoice(["Get ready for some serious lasagna magic!"])).toEqual([]);
    expect(enforceTessVoice(["Just wait until you see my dry humor in full effect."])).toEqual([]);
  });
  it("caps bubbles at two", () => {
    expect(enforceTessVoice(["One.", "Two things.", "Three more."]).length).toBe(2);
  });
  it("keeps at most one allowed emoji per turn", () => {
    const out = enforceTessVoice(["Absolutely not 😂😂 ✨", "Fine 🙄"]);
    expect(out.join(" ").match(/😂|🙄|✨/gu)).toEqual(["😂"]);
  });
  it("keeps at most one exclamation mark per turn", () => {
    const out = enforceTessVoice(["Wow!! Okay!", "Sure!"]);
    expect(out.join(" ").split("!").length - 1).toBe(1);
  });
  it("drops a repeated joke from recent replies", () => {
    const recent = ["A cat launched himself onto Dr. Halloran's head yesterday."];
    expect(enforceTessVoice(["A cat launched himself onto Dr. Halloran's head yesterday."], { recentTess: recent })).toEqual([]);
  });
  it("cleans history lines", () => {
    expect(cleanTessHistoryLine("It's a delicate balance between calm and chaos!")).toBe("…");
  });
});
