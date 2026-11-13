import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { experienceBlocksChat } from "@/lib/experience-chat-protection.server";
import { photoCaptionVisible } from "@/lib/photo-caption";
import { initialScene, transitionScene } from "@/lib/experience-scene";

describe("Brooke dinner protection", () => {
  it("blocks active and paused conversations, not completed or unrelated ones", async () => {
    for (const state of ["interactive", "paused", "completed", "other-conversation"]) {
      const query = { select: () => query, eq: () => query, in: (_key: string, states: string[]) => { expect(states).toEqual(["interactive", "paused"]); return query; }, limit: async () => ({ data: ["interactive", "paused"].includes(state) ? [{ id: "scene" }] : [], error: null }) };
      expect(await experienceBlocksChat({ from: () => query } as never, "owner", "brooke")).toBe(["interactive", "paused"].includes(state));
    }
  });
  it("does not authorize background messages when ownership lookup fails", async () => {
    const query = { select: () => query, eq: () => query, in: () => query, limit: async () => ({ error: { code: "network" } }) };
    await expect(experienceBlocksChat({ from: () => query } as never, "owner", "brooke")).rejects.toThrow("ownership unavailable");
  });
  it("recognizes Brooke's recorded entry without a new outing", () => {
    const scene = { ...initialScene("brooke", "home:brooke", "Brooke's home"), area: "outside" };
    expect(transitionScene(scene, "I step inside with her, smiling.", "brooke", "Brooke")?.area).toBe("inside");
  });
  it("suppresses failed and pending captions but preserves delivered captions", () => {
    expect(photoCaptionVisible({ photo_failure: "failed" })).toBe(false);
    expect(photoCaptionVisible({ photo_pending: { actionId: "job" } })).toBe(false);
    expect(photoCaptionVisible({ generated_path: "private/saved.jpg" })).toBe(true);
  });
  it("uses only the resident's same-experience invitation, rejects withdrawals and unconfirmed player evidence", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE TABLE living_experiences(id uuid,user_id uuid,conversation_id uuid,state text);
        CREATE TABLE conversations(id uuid,user_id uuid,character_id uuid);
        CREATE TABLE characters(id uuid,key text);
        CREATE TABLE living_experience_moments(id uuid,user_id uuid,experience_id uuid,source text,confirmed boolean,ordinal int,body text,created_at timestamptz);
        CREATE FUNCTION housing_resident(uuid,text,text,timestamptz) RETURNS boolean LANGUAGE sql AS $$SELECT $2='home:brooke' AND $3='brooke'$$;`);
      const sql = readFileSync("drizzle/migrations/0078_experience_home_invitation_evidence.sql", "utf8");
      await db.exec(sql.slice(0, sql.indexOf("REVOKE ALL")));
      const u="10000000-0000-4000-a000-000000000001", e="20000000-0000-4000-a000-000000000001", c="30000000-0000-4000-a000-000000000001", ch="40000000-0000-4000-a000-000000000001", m="50000000-0000-4000-a000-000000000001";
      await db.exec(`INSERT INTO living_experiences VALUES('${e}','${u}','${c}','interactive'); INSERT INTO conversations VALUES('${c}','${u}','${ch}'); INSERT INTO characters VALUES('${ch}','brooke'); INSERT INTO living_experience_moments VALUES('${m}','${u}','${e}','user',true,46,'I step inside.',now()),(gen_random_uuid(),'${u}','${e}','character',false,41,'Come in for a few minutes, if you want—we can have some tea.',now());`);
      const allowed=async (place="home:brooke") => (await db.query<{ok:boolean}>("SELECT experience_home_invited($1,$2,$3,$4) ok",[u,e,place,m])).rows[0]?.ok;
      expect(await allowed()).toBe(true);
      expect(await allowed("home:nina")).toBe(false);
      await db.exec("UPDATE living_experience_moments SET confirmed=false WHERE source='user'");
      expect(await allowed()).toBe(false);
      await db.exec("UPDATE living_experience_moments SET confirmed=true WHERE source='user'; UPDATE living_experience_moments SET body='Do not come in.' WHERE source='character'");
      expect(await allowed()).toBe(false);
      await db.exec(`UPDATE living_experience_moments SET body='Come inside.' WHERE source='character'; INSERT INTO living_experience_moments VALUES(gen_random_uuid(),'${u}','${e}','character',false,45,'Changed my mind. Please leave.',now());`);
      expect(await allowed()).toBe(false);
    } finally { await db.close(); }
  });
});