import { describe, expect, it, vi } from "vitest";
import { messageReceipt, nearConversationEnd, parseOutbox } from "@/lib/chat-presentation";
import { persistQueuedMessage } from "@/lib/chat-outbox";

describe("honest message states", () => {
  it("does not infer reading from an unrelated, autonomous, or uncorrelated response", () => {
    expect(messageReceipt("mine", [], true)).toBe("Sent");
    expect(messageReceipt("mine", [{ sender: "tess", metadata: { initiated: true } }], true)).toBe(
      "Sent",
    );
    expect(
      messageReceipt(
        "mine",
        [{ sender: "tess", metadata: { in_reply_to: "older-message" } }],
        true,
      ),
    ).toBe("Sent");
    expect(
      messageReceipt("mine", [{ sender: "user", metadata: { in_reply_to: "mine" } }], true),
    ).toBe("Sent");
  });
  it("uses a persisted correlated response while honoring the read-receipt preference", () => {
    const replies = [{ sender: "tess", metadata: { in_reply_to: "mine" } }];
    expect(messageReceipt("mine", replies, true)).toBe("Read");
    expect(messageReceipt("mine", replies, false)).toBe("Sent");
  });
  it("keeps reading history distinct from following the newest messages", () => {
    expect(nearConversationEnd({ scrollHeight: 2000, clientHeight: 600, scrollTop: 500 })).toBe(
      false,
    );
    expect(nearConversationEnd({ scrollHeight: 2000, clientHeight: 600, scrollTop: 1380 })).toBe(
      true,
    );
  });
});

describe("offline text outbox", () => {
  const message = { id: "10000000-0000-4000-a000-000000000001", body: "See you later", at: 123 };
  it("retains valid messages and stable IDs while rejecting malformed device storage", () => {
    expect(parseOutbox("not json")).toEqual([]);
    expect(parseOutbox('{"id":"invalid"}')).toEqual([]);
    expect(parseOutbox(JSON.stringify([message, message, { ...message, id: "invalid" }]))).toEqual([
      message,
    ]);
  });
  it("confirms ownership and exact content before acknowledging a duplicate after a lost response", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: "23505" } });
    const filters: [string, unknown][] = [];
    const q = {
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        return q;
      },
      maybeSingle: vi.fn().mockResolvedValue({ data: message, error: null }),
    };
    const db = { from: () => ({ insert, select: () => q }) } as unknown as Parameters<
      typeof persistQueuedMessage
    >[0];
    await persistQueuedMessage(db, "owner", "conversation", message);
    expect(insert).toHaveBeenCalledWith({
      id: message.id,
      conversation_id: "conversation",
      user_id: "owner",
      sender: "user",
      body: message.body,
    });
    expect(filters).toEqual([
      ["id", message.id],
      ["user_id", "owner"],
      ["conversation_id", "conversation"],
      ["sender", "user"],
    ]);
    q.maybeSingle.mockResolvedValue({ data: { ...message, body: "different" }, error: null });
    await expect(persistQueuedMessage(db, "owner", "conversation", message)).rejects.toThrow(
      "still queued",
    );
  });
  it("keeps failed writes queued instead of declaring delivery", async () => {
    const db = {
      from: () => ({ insert: async () => ({ error: { code: "network" } }) }),
    } as unknown as Parameters<typeof persistQueuedMessage>[0];
    await expect(persistQueuedMessage(db, "owner", "conversation", message)).rejects.toThrow(
      "still queued",
    );
  });
});
