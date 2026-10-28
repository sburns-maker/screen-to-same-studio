// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
import { persistLiveCallTranscript } from "@/lib/live-call-transcript.server";
let db: Awaited<ReturnType<typeof worldDatabase>>;
let admin: ReturnType<typeof postgresSupabase>["admin"];
const user = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
const cid = "20000000-0000-4000-8000-000000000001",
  call = "30000000-0000-4000-8000-000000000001";
const lines = [
  { role: "user" as const, text: "We discussed a specific question." },
  { role: "character" as const, text: "Here is my answer, with time to think." },
];
beforeAll(async () => {
  db = await worldDatabase();
  admin = postgresSupabase(db).admin;
  await db.exec(
    "CREATE TABLE live_character_calls(id uuid PRIMARY KEY,user_id uuid,conversation_id uuid,character_key text)",
  );
  await db.query(
    "INSERT INTO conversations(id,user_id,character_id) SELECT $1,$2,id FROM characters WHERE key='claire'",
    [cid, user],
  );
  await db.query("INSERT INTO live_character_calls VALUES($1,$2,$3,'claire')", [call, user, cid]);
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec("TRUNCATE messages CASCADE");
});
it("checkpoints completed speech and persists the final line exactly once", async () => {
  await persistLiveCallTranscript(admin, user, call, lines);
  let saved = (
    await db.query<{ body: string; metadata: { transcript_ordinal: number } }>(
      "SELECT body,metadata FROM messages",
    )
  ).rows;
  expect(saved.map((x) => x.body)).toEqual([lines[0]!.text]);
  await persistLiveCallTranscript(admin, user, call, lines, true);
  await persistLiveCallTranscript(admin, user, call, lines, true);
  saved = (
    await db.query<{ body: string; metadata: { transcript_ordinal: number } }>(
      "SELECT body,metadata FROM messages ORDER BY (metadata->>'transcript_ordinal')::int",
    )
  ).rows;
  expect(saved.map((x) => x.body)).toEqual(lines.map((x) => x.text));
  const rows = (
    await db.query<{
      user_id: string;
      conversation_id: string;
      sender: string;
      metadata: Record<string, unknown>;
    }>("SELECT * FROM messages ORDER BY (metadata->>'transcript_ordinal')::int")
  ).rows;
  expect(rows.map((x) => x.sender)).toEqual(["user", "tess"]);
  for (const row of rows) {
    expect(row.user_id).toBe(user);
    expect(row.conversation_id).toBe(cid);
    expect(row.metadata).toMatchObject({
      channel: "voice",
      live_call_id: call,
      push_primary: false,
    });
    expect(row.metadata).not.toHaveProperty("commitment_action");
  }
});
it("does not save a still-streaming last line or overwrite a completed line", async () => {
  await persistLiveCallTranscript(admin, user, call, [lines[0]!]);
  expect((await db.query("SELECT * FROM messages")).rows).toHaveLength(0);
  await persistLiveCallTranscript(admin, user, call, lines);
  await persistLiveCallTranscript(
    admin,
    user,
    call,
    [{ ...lines[0]!, text: "changed" }, lines[1]!],
    true,
  );
  expect(
    (await db.query<{ body: string }>("SELECT body FROM messages WHERE sender='user'")).rows[0]!
      .body,
  ).toBe(lines[0]!.text);
});
it("denies another user's call and missing calls", async () => {
  await expect(persistLiveCallTranscript(admin, other, call, lines, true)).rejects.toThrow(
    "Call not found",
  );
  await expect(
    persistLiveCallTranscript(admin, user, crypto.randomUUID(), lines, true),
  ).rejects.toThrow("Call not found");
  expect((await db.query("SELECT * FROM messages")).rows).toHaveLength(0);
});
it("rejects a character/conversation mismatch without writing", async () => {
  await db.query("UPDATE live_character_calls SET character_key='riley' WHERE id=$1", [call]);
  await expect(persistLiveCallTranscript(admin, user, call, lines, true)).rejects.toThrow(
    "Call conversation mismatch",
  );
  await db.query("UPDATE live_character_calls SET character_key='claire' WHERE id=$1", [call]);
  expect((await db.query("SELECT * FROM messages")).rows).toHaveLength(0);
});
it("does not invent lines for an empty transcript or accept unbounded input", async () => {
  expect(await persistLiveCallTranscript(admin, user, call, [], true)).toEqual({ saved: 0 });
  await expect(
    persistLiveCallTranscript(admin, user, call, [{ role: "user", text: "x".repeat(4001) }], true),
  ).rejects.toThrow();
});
