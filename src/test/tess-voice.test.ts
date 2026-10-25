import { describe, it, expect } from "vitest";
import { enforceTessVoice, cleanTessHistoryLine, CONTACT_VOICE } from "@/lib/tess-voice";

describe("enforceTessVoice", () => {
  it("removes self-description of her personality", () => {
    const out = enforceTessVoice([
      "Sarcasm is basically my second language. Anyway, Mabel ate a sock.",
    ]);
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
  it("preserves a historical readback; same-conversation prompt guidance handles recurring jokes", () => {
    const recent = ["A cat launched himself onto Dr. Halloran's head yesterday."];
    expect(
      enforceTessVoice(["A cat launched himself onto Dr. Halloran's head yesterday."], {
        recentTess: recent,
      }),
    ).toEqual(recent);
  });
  it("cleans history lines", () => {
    expect(cleanTessHistoryLine("It's a delicate balance between calm and chaos!")).toBe("…");
  });
});

describe("contact voice", () => {
  it("does not strip a sincere acknowledgment from Claire", () => {
    const out = enforceTessVoice(
      ["But seriously, I appreciate your kind words. Tomatoes, obviously."],
      { ...CONTACT_VOICE["claire"] },
    );
    expect(out).toEqual(["But seriously, I appreciate your kind words. Tomatoes, obviously."]);
  });
  it("caps Claire at two bubbles", () => {
    expect(
      enforceTessVoice(["a one.", "b two.", "c three."], { ...CONTACT_VOICE["claire"] }).length,
    ).toBe(2);
  });
  it("Jordan never uses exclamation marks", () => {
    expect(enforceTessVoice(["Fine!"], { ...CONTACT_VOICE["jordan"] })).toEqual(["Fine."]);
  });
});

describe("punctuation and meaning survive voice cleanup", () => {
  it.each([
    "...yeah, I'm home. Groceries are away.",
    'She said "meet me at 7:30." That still works.',
    "Dr. Halloran said it's $3.50. https://example.com/menu?day=friday",
    "nah, just tired lol",
    "I'm not ready. Please don't.",
  ])("preserves ordinary texting, quotes and factual values: %s", (text) => {
    expect(enforceTessVoice([text])).toEqual([text]);
  });
  it("does not leave broken question/period pairs when reducing exclamations", () => {
    expect(enforceTessVoice(["Really?!"], { ...CONTACT_VOICE["jordan"] })).toEqual(["Really?"]);
    expect(enforceTessVoice(["Wait!!?"], { ...CONTACT_VOICE["jordan"] })).toEqual(["Wait?"]);
  });
  it("removes a whole unsupported emoji without leaving skin-tone or joiner fragments", () => {
    expect(enforceTessVoice(["Thanks 👍🏽"])).toEqual(["Thanks"]);
    expect(enforceTessVoice(["At work 👩🏽‍⚕️"])).toEqual(["At work"]);
  });
  it("preserves different meanings even when two short bubbles share most words", () => {
    expect(
      enforceTessVoice(["I can meet you at seven.", "I can't meet you at seven."]),
    ).toHaveLength(2);
    expect(enforceTessVoice(["Meet me at 7:30.", "Meet me at 8:30."])).toHaveLength(2);
    expect(enforceTessVoice(["Meet me at 7:30.", "Meet me at 7:30."])).toHaveLength(1);
  });
});
