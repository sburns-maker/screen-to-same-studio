import { describe, expect, it } from "vitest";
import {
  conversationFocus,
  focusDiagnostic,
  mentionsThread,
  type ConversationThread,
  type TopicMessage,
} from "@/lib/conversation-focus";

const now = new Date("2026-10-27T20:00:00Z");
const becca: ConversationThread = {
  id: "maya-visit",
  title: "Making time for Becca",
  summary: "Maya and Becca are looking for a weekend when they can spend time together",
  person: "Becca",
  changedAt: "2026-10-25T12:00:00Z",
  active: true,
};
const own = (body: string, at = "2026-10-27T14:00:00Z"): TopicMessage => ({
  sender: "tess",
  body,
  created_at: at,
});
const initial = own("Becca and I are still trying to find a free weekend.");
const focus = (overrides: Partial<Parameters<typeof conversationFocus>[0]> = {}) =>
  conversationFocus({
    threads: [becca],
    history: [initial],
    now,
    latestUser: "",
    autonomous: true,
    reason: becca.summary,
    ...overrides,
  });

describe("grounded conversational autonomy", () => {
  it("recognizes the reported planning paraphrases without requiring verbatim repetition", () => {
    for (const line of [
      "Becca and I are comparing calendars again.",
      "Still no free time to see Becca.",
      "Trying to get a weekend with Becca sorted.",
    ])
      expect(mentionsThread(line, becca)).toBe(true);
    expect(focus().reason).toBeNull();
    expect(focus().background).toEqual([becca]);
    expect(focus().prompt).toContain("not an instruction to mention it again");
  });

  it("does not ban Becca herself or confuse a genuinely different topic with scheduling", () => {
    expect(mentionsThread("Becca recommended a great album.", becca)).toBe(false);
    expect(mentionsThread("You and I could have dinner on Wednesday.", becca)).toBe(false);
    expect(focus({ reason: "Becca recommended a great album." }).reason).toBe(
      "Becca recommended a great album.",
    );
  });

  it.each(["Did you find time with Becca?", "How is Becca?", "Did you two find a weekend?"])(
    "answers a direct player question: %s",
    (latestUser) => {
      expect(focus({ autonomous: false, latestUser }).background).toEqual([]);
    },
  );

  it("does not treat a generic how-was-work question as a request for the Becca update", () => {
    expect(focus({ autonomous: false, latestUser: "How was work?" }).background).toEqual([becca]);
    expect(focus({ autonomous: false, latestUser: "How was work?" }).prompt).toContain(
      "Answer the player's actual message first",
    );
  });

  it("ignores stale player requests during an autonomous initiation", () => {
    expect(focus({ latestUser: "How is Becca?", autonomous: true }).background).toEqual([becca]);
  });

  it("permits a genuinely new recorded milestone without manufacturing one", () => {
    const updated = {
      ...becca,
      changedAt: "2026-10-27T19:00:00Z",
      summary: "Maya and Becca compared calendars and a low-key visit now looks possible",
    };
    expect(focus({ threads: [updated], reason: updated.summary }).background).toEqual([]);
    expect(focus({ threads: [updated], reason: updated.summary }).reason).toBe(updated.summary);
  });

  it("keeps intentional follow-through available even when the topic was mentioned", () => {
    expect(focus({ requiredFollowThrough: true }).background).toEqual([]);
    expect(focus({ requiredFollowThrough: true }).reason).toBe(becca.summary);
  });

  it("does not count hidden, future, player-authored or previous-day messages as a disclosure today", () => {
    const histories = [
      [{ ...initial, visible_at: "2026-10-27T21:00:00Z" }],
      [own(initial.body, "2026-10-27T22:00:00Z")],
      [{ ...initial, sender: "user" }],
      [own(initial.body, "2026-10-26T12:00:00Z")],
    ];
    for (const history of histories) expect(focus({ history }).background).toEqual([]);
  });

  it("remembers this morning's exposure even after 80 unrelated bubbles", () => {
    const history = [
      initial,
      ...Array.from({ length: 80 }, () => own("That sounds good.", "2026-10-27T18:00:00Z")),
    ];
    expect(focus({ history }).background).toEqual([becca]);
  });

  it("counts delayed text when it becomes visible rather than when it was prepared", () => {
    const history = [
      { ...initial, created_at: "2026-10-26T18:00:00Z", visible_at: "2026-10-27T18:00:00Z" },
    ];
    expect(focus({ history }).background).toEqual([becca]);
  });

  it("does not keep promoting the same status across 20 autonomous opportunities", () => {
    const history = [initial];
    for (let i = 0; i < 20; i++) {
      const result = focus({ history });
      expect(result.reason).toBeNull();
      expect(result.reasonRepeated).toBe(true);
      history.push(
        own(
          "One ordinary grounded observation.",
          `2026-10-27T19:${String(i).padStart(2, "0")}:00Z`,
        ),
      );
    }
  });

  it("does not overreact to two bubbles or erase, close, or mutate the underlying situation", () => {
    const thread = structuredClone(becca),
      history = [initial, own("No weekend yet with Becca.")];
    const before = structuredClone({ thread, history });
    const result = focus({ threads: [thread], history });
    expect(result.background).toHaveLength(1);
    expect({ thread, history }).toEqual(before);
    expect(result.prompt).toContain("They remain valid memories");
  });

  it("generalizes to another character's known storyline rather than only a hardcoded Becca ban", () => {
    const thread = {
      ...becca,
      id: "claire-family",
      title: "Planning time with Natalie",
      person: "Natalie",
      summary: "Claire and Natalie are planning a family visit",
    };
    const result = focus({
      threads: [thread],
      history: [own("Natalie and I still need to compare calendars for a visit.")],
      reason: thread.summary,
    });
    expect(result.background).toEqual([thread]);
    expect(result.reason).toBeNull();
  });

  it("allows independent opinions and quiet endings without fake events or forced topic rotation", () => {
    expect(focus().prompt).toContain("volunteer ordinary preferences and opinions");
    expect(focus().prompt).toContain("choose not to send anything");
    expect(focus().prompt).toContain("Do not mechanically rotate");
    expect(focus().prompt).toContain("without inventing a completed incident");
  });

  it("reports repetition with counts only, without logging messages, names or thread IDs", () => {
    const diagnostic = focusDiagnostic(focus(), ["Still comparing calendars with Becca."]);
    expect(diagnostic).toMatchObject({
      backgroundThreads: 1,
      repeatedBackgroundTopics: 1,
      repeatedInitiationReason: true,
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/Becca|maya-visit|calendars/);
  });
});
