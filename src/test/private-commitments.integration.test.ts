// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
import { RELATIONSHIP_CAST } from "@/lib/relationship-commitments";
let db: PGlite;
const user = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const conversations = new Map<string, string>();
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE TABLE characters(id uuid PRIMARY KEY,key text);
    CREATE TABLE conversations(id uuid PRIMARY KEY,user_id uuid,character_id uuid);
    CREATE TABLE messages(id uuid PRIMARY KEY,user_id uuid,conversation_id uuid,sender text,body text,metadata jsonb,visible_at timestamptz);
    SET request.jwt.claim.role='service_role';`);
  await db.exec(readFileSync("drizzle/migrations/0050_relationship_commitments.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0053_private_character_commitments.sql", "utf8"));
  for (const key of RELATIONSHIP_CAST) {
    const cid = crypto.randomUUID(),
      id = crypto.randomUUID();
    conversations.set(key, cid);
    await db.query("INSERT INTO characters VALUES($1,$2)", [id, key]);
    await db.query("INSERT INTO conversations VALUES($1,$2,$3)", [cid, user, id]);
  }
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "RESET ROLE; SET request.jwt.claim.role='service_role'; TRUNCATE messages,relationship_commitment_events;",
  );
});
async function propose(character: string, owner = user) {
  const id = crypto.randomUUID();
  await db.query("SELECT relationship_player_command($1,$2,$3,'partnership','propose',null)", [
    owner,
    id,
    character,
  ]);
  return id;
}
async function reply(character: string, proposalId: string, action = "accept", future = false) {
  const quote =
    action === "accept" ? "Yes, I want us to be together." : "I'm not ready for a relationship.";
  await db.query("INSERT INTO messages VALUES($1,$2,$3,$7,$4,$5,CASE WHEN $6 THEN now()+interval '1 hour' ELSE now() END)", [
    crypto.randomUUID(),
    user,
    conversations.get(character),
    quote,
    JSON.stringify({ commitment_action: { action, kind: "partnership", quote, proposalId } }),
    future,
    character,
  ]);
}
async function sync(character: string, owner = user) {
  return db.query("SELECT relationship_sync_character($1,$2)", [owner, character]);
}
async function row(id: string) {
  return (
    await db.query<{ status: string; character_response: string }>(
      "SELECT status,character_response FROM relationship_commitment_events WHERE id=$1",
      [id],
    )
  ).rows[0]!;
}
it.each(RELATIONSHIP_CAST)("records only %s's own visible decision once", async (character) => {
  const id = await propose(character);
  await reply(character, id);
  await sync(character);
  expect((await row(id)).status).toBe("accepted");
  await sync(character);
  expect((await db.query("SELECT * FROM relationship_commitment_events")).rows).toHaveLength(1);
});
it("cannot accept another character's or another user's proposal", async () => {
  const tess = await propose("tess"),
    foreign = await propose("riley", other);
  await reply("riley", tess);
  await reply("riley", foreign);
  await sync("riley");
  expect((await row(tess)).status).toBe("pending");
  expect((await row(foreign)).status).toBe("pending");
  await sync("tess");
  expect((await row(tess)).status).toBe("pending");
});
it("does not process a hidden response or change a refusal into acceptance", async () => {
  const id = await propose("maya");
  await reply("maya", id, "accept", true);
  await sync("maya");
  expect((await row(id)).status).toBe("pending");
  await reply("maya", id, "decline");
  await sync("maya");
  expect((await row(id)).status).toBe("declined");
  await reply("maya", id);
  await sync("maya");
  expect((await row(id)).status).toBe("declined");
});
it("keeps player consent pending for character-initiated proposals", async () => {
  const quote = "I'd like us to be in a committed relationship.";
  await db.query("INSERT INTO messages VALUES($1,$2,$3,'tess',$4,$5,now())", [
    crypto.randomUUID(),
    user,
    conversations.get("claire"),
    quote,
    JSON.stringify({ commitment_action: { action: "propose", kind: "partnership", quote } }),
  ]);
  await sync("claire");
  const event = (
    await db.query<{ status: string; user_response: string }>(
      "SELECT * FROM relationship_commitment_events",
    )
  ).rows[0]!;
  expect(event.status).toBe("pending");
  expect(event.user_response).toBe("pending");
});
it("keeps Ben unsupported and denies client execution and reads", async () => {
  await expect(sync("ben")).rejects.toThrow("Unsupported relationship character");
  await db.exec("SET ROLE authenticated; SET request.jwt.claim.role='authenticated'");
  await expect(sync("tess")).rejects.toThrow(/permission denied/);
  await expect(db.query("SELECT * FROM relationship_commitment_events")).rejects.toThrow(
    /permission denied/,
  );
});

it("keeps the legacy Tess synchronizer compatible", async () => {
  const id = await propose("tess");
  await reply("tess", id);
  await db.query("SELECT relationship_sync_tess($1)", [user]);
  expect((await row(id)).status).toBe("accepted");
});
