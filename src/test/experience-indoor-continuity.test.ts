// @vitest-environment node
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { initialScene, transitionScene, type LiveScene } from "@/lib/experience-scene";

const owner = "10000000-0000-4000-a000-000000000001";
const experience = "20000000-0000-4000-a000-000000000001";
const conversation = "30000000-0000-4000-a000-000000000001";
const character = "40000000-0000-4000-a000-000000000001";
const evidence = "50000000-0000-4000-a000-000000000001";
const plan = "60000000-0000-4000-a000-000000000001";
const db = new PGlite();
const couch: LiveScene = { ...initialScene("brooke", "home:brooke", "Brooke's home"), area: "living room (couch)", activity: "relaxing" };
const narration = "I take her hand and follow her upstairs. Once we're in her bedroom, I pull her close. Fade to black.";

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'service_role'::text$$;
    CREATE TABLE living_experiences(id uuid,user_id uuid,conversation_id uuid,plan_id uuid,state text,mode text,live_scene jsonb,scene_revision int,scene_source_ordinal int);
    CREATE TABLE social_plans(id uuid,user_id uuid,place_key text,user_response text,character_response text);
    CREATE TABLE conversations(id uuid,user_id uuid,character_id uuid);
    CREATE TABLE characters(id uuid,key text,preferred_name text);
    CREATE TABLE living_experience_moments(id uuid,user_id uuid,experience_id uuid,source text,confirmed boolean,ordinal int,body text,created_at timestamptz);
    CREATE TABLE world_places(user_id uuid,key text,label text,kind text,metadata jsonb);
    CREATE TABLE housing_residences(user_id uuid,place_key text);
    CREATE TABLE experience_scene_transitions(user_id uuid,experience_id uuid,source_id uuid,source_ordinal int,before_scene jsonb,after_scene jsonb,changed boolean,evidence_quote text);
    CREATE FUNCTION housing_can_enter(uuid,text,text,timestamptz) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
    CREATE FUNCTION housing_resident(uuid,text,text,timestamptz) RETURNS boolean LANGUAGE sql AS $$SELECT $2='home:brooke' AND $3='brooke'$$;`);
  const original = readFileSync("drizzle/migrations/0039_experience_live_scene.sql", "utf8");
  let apply = original.slice(original.indexOf("CREATE FUNCTION experience_scene_apply"), original.indexOf("REVOKE ALL"));
  const housing = readFileSync("drizzle/migrations/0045_residences_households.sql", "utf8");
  const guard = housing.slice(housing.indexOf("  IF EXISTS(SELECT 1 FROM housing_residences WHERE user_id=p_user AND place_key=loc)"), housing.indexOf("$new$);", housing.indexOf("  IF EXISTS(SELECT 1 FROM housing_residences WHERE user_id=p_user AND place_key=loc)")));
  apply = apply.replace("loc:=p_scene->>'locationKey';", "loc:=p_scene->>'locationKey';\n" + guard);
  apply = apply.replace("'at_front_door','waiting')", "'at_front_door','waiting','relaxing','private_moment')");
  await db.exec(apply);
  await db.exec(readFileSync("drizzle/migrations/0078_experience_home_invitation_evidence.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0079_experience_indoor_room_continuity.sql", "utf8"));
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec("TRUNCATE living_experiences,social_plans,conversations,characters,living_experience_moments,housing_residences,experience_scene_transitions;");
  await db.query("INSERT INTO living_experiences VALUES($1,$2,$3,$4,'interactive','interactive',$5,7,60)", [experience, owner, conversation, plan, JSON.stringify(couch)]);
  await db.query("INSERT INTO social_plans VALUES($1,$2,'diner:valley','accepted','accepted')", [plan, owner]);
  await db.query("INSERT INTO conversations VALUES($1,$2,$3)", [conversation, owner, character]);
  await db.query("INSERT INTO characters VALUES($1,'brooke','Brooke')", [character]);
  await db.query("INSERT INTO housing_residences VALUES($1,'home:brooke')", [owner]);
  await db.query("INSERT INTO living_experience_moments VALUES($1,$2,$3,'user',true,62,$4,now())", [evidence, owner, experience, narration]);
  await db.query("INSERT INTO living_experience_moments VALUES(gen_random_uuid(),$1,$2,'character',false,41,'Come inside.',now()),(gen_random_uuid(),$1,$2,'character',false,59,'I’m not ready to stop either.',now())", [owner, experience]);
});
const invited = async () => (await db.query<{ allowed: boolean }>("SELECT experience_home_invited($1,$2,'home:brooke',$3) allowed", [owner, experience, evidence])).rows[0]?.allowed;
const upstairs = () => {
  const next = transitionScene(couch, narration, "brooke", "Brooke");
  if (!next) throw new Error("Expected recorded upstairs transition");
  return db.query<{ result: { scene: { area: string; activity: string }; replayed?: boolean } }>("SELECT experience_scene_apply($1,$2,$3,7,$4,$5) result", [owner, plan, evidence, JSON.stringify(next), narration]);
};
it("does not revoke a home invitation for 'not ready to stop either'", async () => {
  expect(await invited()).toBe(true);
});
it.each(["I'm not ready for company.", "I'm not ready to have you over.", "Do not come inside.", "Please leave."])("honors a genuine hosting withdrawal: %s", async (body) => {
  await db.query("UPDATE living_experience_moments SET body=$1 WHERE ordinal=59", [body]);
  expect(await invited()).toBe(false);
});
it("persists the upstairs transition with expired access and no surviving invitation, exactly once", async () => {
  await db.exec("DELETE FROM living_experience_moments WHERE source='character'");
  expect(await invited()).toBe(false);
  expect((await upstairs()).rows[0]?.result.scene).toMatchObject({ area: "bedroom", activity: "private_moment" });
  expect((await upstairs()).rows[0]?.result.replayed).toBe(true);
  expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM experience_scene_transitions")).rows[0]?.n).toBe(1);
  expect((await db.query<{ ordinal: number }>("SELECT scene_source_ordinal ordinal FROM living_experiences")).rows[0]?.ordinal).toBe(62);
});
it.each(["outside", "front door (outside)", "porch", "doorstep", "driveway", ""])("does not bypass new entry from %s", async (area) => {
  await db.exec("DELETE FROM living_experience_moments WHERE source='character'");
  await db.query("UPDATE living_experiences SET live_scene=$1", [JSON.stringify({ ...couch, area })]);
  await expect(upstairs()).rejects.toThrow("home entry requires an invitation");
});
it("keeps owner, evidence and revision guards for room transitions", async () => {
  await db.exec("UPDATE living_experience_moments SET confirmed=false WHERE source='user'");
  await expect(upstairs()).rejects.toThrow("Actual recorded user evidence required");
  await db.exec("UPDATE living_experience_moments SET confirmed=true WHERE source='user'; UPDATE living_experiences SET scene_revision=8");
  await expect(upstairs()).rejects.toThrow("Scene revision or causal order changed");
  await db.query("UPDATE living_experiences SET user_id=$1", [character]);
  await expect(upstairs()).rejects.toThrow("Owned interactive experience required");
});