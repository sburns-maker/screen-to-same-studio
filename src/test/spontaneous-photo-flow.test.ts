import { describe, it, expect } from "vitest";
import { spontaneousPhotoQueue } from "@/lib/spontaneous-photo-flow";
const now = new Date("2026-10-26T13:45:00Z");
describe("spontaneous photo delivery queue", () => {
  it("allows text replies to finish first without treating them as photo refusals", () => {
    const q = spontaneousPhotoQueue(
      [{ sender: "tess", body: "Later reply", visible_at: "2026-10-26T14:00:00Z", metadata: {} }],
      now,
    );
    expect(q).toMatchObject({
      blocked: false,
      texts: ["Later reply"],
      deliverAfter: Date.parse("2026-10-26T14:00:00Z"),
    });
  });
  it("protects paid images, rejects overfull queues and ignores past/user messages", () => {
    expect(
      spontaneousPhotoQueue(
        [
          {
            sender: "tess",
            visible_at: "2026-10-26T14:00:00Z",
            metadata: { generated_path: "private/file.png" },
          },
        ],
        now,
      ).blocked,
    ).toBe(true);
    expect(
      spontaneousPhotoQueue(
        Array(40).fill({ sender: "tess", visible_at: "2026-10-26T14:00:00Z" }),
        now,
      ).blocked,
    ).toBe(true);
    expect(
      spontaneousPhotoQueue(
        [
          { sender: "user", visible_at: "2026-10-26T14:00:00Z" },
          { sender: "tess", visible_at: "2026-10-26T13:00:00Z" },
        ],
        now,
      ).texts,
    ).toEqual([]);
  });
});
