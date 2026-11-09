// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { CHARACTERS } from "@/lib/characters";
import { PROFILE_PORTRAITS } from "@/lib/character-portraits";
import { DIALOGUE_PROFILES } from "@/lib/dialogue-personality";
import { PHOTOGRAPHY_PROFILES } from "@/lib/photo-personality";
import { PHOTO_INTENSITY_PROFILES } from "@/lib/photo-mature-personality";
import { WORKPLACES } from "@/lib/workplaces";
import { VOICE_DESIGN_KEYS } from "@/lib/live-voice-design";
import { SPICY_CAST } from "@/lib/spicy-image.server";
import { RELATIONSHIP_CAST } from "@/lib/relationship-commitments";
import { CANON_LINKS, CANON_NPCS } from "@/lib/social-logic";
import { referenceCharacterSchema } from "@/lib/photo-reference-library";
import {
  BROOKE_OFFER_TEXT, contactUnlocked, introductionContext, naturalOpening, shouldOffer, transition,
} from "@/lib/brooke-introduction";
import {
  maybeOfferBrookeIntroduction, reconcileBrookeMeeting, respondToBrookeIntroduction, introductionRow,
} from "@/lib/brooke-introduction.server";

const KEYS = ["carly", "brooke"] as const;

describe("Carly and Brooke registration", () => {
  it("are registered in every exhaustive cast registry", () => {
    for (const k of KEYS) {
      expect(CHARACTERS[k].key).toBe(k);
      expect(PROFILE_PORTRAITS[k].asset).toBe(`src/assets/avatars/${k}-canon.jpg`);
      expect(DIALOGUE_PROFILES[k]).toBeTruthy();
      expect(PHOTOGRAPHY_PROFILES[k].key).toBe(k);
      expect(PHOTO_INTENSITY_PROFILES[k]).toBeTruthy();
      expect(WORKPLACES[k].label).toBe("After Dark");
      expect(VOICE_DESIGN_KEYS).toContain(k);
      expect(SPICY_CAST).toContain(k);
      expect(RELATIONSHIP_CAST).toContain(k);
      expect(referenceCharacterSchema.parse(k)).toBe(k);
    }
  });
  it("keep distinct identities, ages and hair", () => {
    expect(CHARACTERS.carly.age).toBe(28);
    expect(CHARACTERS.brooke.age).toBe(26);
    expect(CHARACTERS.carly.appearance).toMatch(/jet-black/);
    expect(CHARACTERS.carly.appearance).toMatch(/floral tattoo/);
    expect(CHARACTERS.brooke.appearance).toMatch(/platinum-blonde/);
    expect(CHARACTERS.brooke.appearance).toMatch(/shorter than Carly/);
    expect(CHARACTERS.carly.seedState).not.toEqual(CHARACTERS.brooke.seedState);
  });
  it("are established friends with their own independent circles", () => {
    expect(CANON_LINKS.some(l => l.characterKey === "carly" && l.otherKey === "brooke" && l.level === "close_friend")).toBe(true);
    expect(CANON_LINKS.some(l => l.characterKey === "brooke" && l.otherKey === "carly" && l.level === "close_friend")).toBe(true);
    const carlyNpcs = CANON_NPCS.filter(n => n.characterKey === "carly").map(n => n.name);
    const brookeNpcs = CANON_NPCS.filter(n => n.characterKey === "brooke").map(n => n.name);
    expect(carlyNpcs.some(n => brookeNpcs.includes(n))).toBe(false);
  });
  it("Brooke's opener is the moving-help text, Carly's is not", () => {
    expect(CHARACTERS.brooke.opener).toMatch(/help me move/);
    expect(CHARACTERS.carly.opener).not.toMatch(/Brooke/);
  });
});

describe("Brooke introduction rules", () => {
  it("offers only after the first meaningful Carly conversation with a natural opening", () => {
    const base = { characterKey: "carly", status: "not_mentioned" as const, userMessages: 3, carlyMessages: 3, latestUserText: "haha same, what are you up to tonight?", initiation: false };
    expect(shouldOffer(base)).toBe(true);
    expect(shouldOffer({ ...base, userMessages: 2 })).toBe(false);
    expect(shouldOffer({ ...base, latestUserText: "my dad is in the hospital" })).toBe(false);
    expect(shouldOffer({ ...base, characterKey: "brooke" })).toBe(false);
    expect(shouldOffer({ ...base, initiation: true })).toBe(false);
    for (const s of ["text_offered", "contact_accepted", "declined", "met"] as const)
      expect(shouldOffer({ ...base, status: s })).toBe(false);
    expect(naturalOpening("")).toBe(false);
    expect(BROOKE_OFFER_TEXT).toMatch(/Mind texting her\?/);
  });
  it("only allows valid transitions", () => {
    expect(transition("not_mentioned", "offer")).toBe("text_offered");
    expect(transition("text_offered", "accept")).toBe("contact_accepted");
    expect(transition("text_offered", "decline")).toBe("declined");
    expect(transition("declined", "accept")).toBeNull();
    expect(transition("not_mentioned", "accept")).toBeNull();
    expect(transition("contact_accepted", "meet")).toBe("met");
    expect(transition("text_offered", "meet")).toBeNull();
  });
  it("Brooke is reachable only after acceptance; other contacts are never gated", () => {
    for (const s of [null, "not_mentioned", "text_offered", "declined"] as const) expect(contactUnlocked("brooke", s)).toBe(false);
    expect(contactUnlocked("brooke", "contact_accepted")).toBe(true);
    expect(contactUnlocked("brooke", "met")).toBe(true);
    expect(contactUnlocked("carly", null)).toBe(true);
    expect(contactUnlocked("tess", null)).toBe(true);
  });
  it("gives each woman only her own private context", () => {
    expect(introductionContext("brooke", "contact_accepted")).toMatch(/NOT met in person/);
    expect(introductionContext("brooke", "contact_accepted")).toMatch(/not a date or consent/);
    expect(introductionContext("brooke", "met")).toMatch(/helped you move/);
    expect(introductionContext("carly", "contact_accepted")).toMatch(/do not know what they have texted/);
    expect(introductionContext("carly", "declined")).toMatch(/don't bring it up again/);
    expect(introductionContext("tess", "met")).toBeNull();
  });
});

/** Minimal supabase-js stand-in over in-memory tables, enough for the introduction service. */
function fakeDb() {
  const tables: any = {
    after_dark_introductions: [], messages: [], conversations: [], characters: [], living_experiences: [], social_plans: [],
  };
  const from = (name: string) => {
    const rows = (): any[] => tables[name];
    const filters: ((r: any) => boolean)[] = [];
    let op: "select" | "update" | "insert" = "select", patch: Record<string, unknown> = {}, head = false;
    let order: [string, boolean] | null = null, inserted: Record<string, unknown>[] = [];
    const run = () => {
      if (op === "insert") return inserted;
      let r: any[] = rows().filter(x => filters.every(f => f(x)));
      if (op === "update") { r.forEach(x => Object.assign(x, patch)); return r; }
      if (order) { const [k, asc] = order; r = [...r].sort((a, b) => String(a[k]).localeCompare(String(b[k])) * (asc ? 1 : -1)); }
      return r.map(x => (name === "conversations" ? { ...x, character: tables.characters.find((c: any) => c.id === x.character_id) } : x));
    };
    const q: Record<string, unknown> = {
      select: (_c?: string, o?: { head?: boolean }) => { head = !!o?.head; return q; },
      eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return q; },
      lte: (k: string, v: string) => { filters.push(r => r[k] <= v); return q; },
      order: (k: string, o?: { ascending?: boolean }) => { order = [k, o?.ascending !== false]; return q; },
      limit: () => q,
      update: (p: Record<string, unknown>) => { op = "update"; patch = p; return q; },
      insert: (p: Record<string, unknown>) => {
        op = "insert";
        if (name === "after_dark_introductions" && tables[name].some((r: any) => r.user_id === (p as any).user_id))
          return Object.assign(Promise.resolve({ error: { code: "23505" } }), q);
        const row: any = { id: crypto.randomUUID(), brooke_consented: false, ...p };
        tables[name].push(row); inserted = [row]; return q;
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => ({ data: run()[0], error: null }),
      then: (res: (v: unknown) => void) => res(head ? { count: run().length, error: null } : { data: run(), error: null }),
    };
    return q;
  };
  return { tables, client: { from } as never };
}

describe("Brooke introduction persistence", () => {
  const user = "20000000-0000-4000-8000-000000000001";
  let db: ReturnType<typeof fakeDb>;
  const carlyConv = "c0000000-0000-4000-8000-000000000001";
  const brookeConv = "b0000000-0000-4000-8000-000000000001";
  beforeEach(() => {
    db = fakeDb();
    db.tables.characters!.push({ id: "carly-id", key: "carly" }, { id: "brooke-id", key: "brooke" });
    db.tables.conversations!.push({ id: carlyConv, user_id: user, character_id: "carly-id" });
    let n = 0;
    const msg = (sender: string, body: string) => db.tables.messages!.push({ id: crypto.randomUUID(), user_id: user, conversation_id: carlyConv, sender, body, created_at: new Date(Date.now() - 60000 + n++ * 1000).toISOString(), visible_at: new Date(Date.now() - 60000 + n * 1000).toISOString() });
    msg("tess", "hey it's carly"); msg("user", "hey!"); msg("tess", "what you up to"); msg("user", "not much"); msg("tess", "same lol"); msg("user", "want to grab food sometime?");
  });
  const offers = () => db.tables.messages.filter((m: any) => (m.metadata as { after_dark_intro?: string } | undefined)?.after_dark_intro === "brooke_offer");
  const showOffer = () => offers().forEach((m: any) => { m.visible_at = new Date(Date.now() - 1000).toISOString(); });

  it("offers once, durably, and never repeats across turns or background ticks", async () => {
    expect(await maybeOfferBrookeIntroduction(db.client, user, carlyConv, { initiation: true })).toBe(false);
    expect(await maybeOfferBrookeIntroduction(db.client, user, carlyConv, { initiation: false })).toBe(true);
    expect(await maybeOfferBrookeIntroduction(db.client, user, carlyConv, { initiation: false })).toBe(false);
    expect(offers()).toHaveLength(1);
    const row = await introductionRow(db.client, user);
    expect(row?.status).toBe("text_offered");
    expect(row?.brooke_consented).toBe(true);
    expect(row?.offer_message_id).toBe(offers()[0]!.id);
  });
  it("accepting unlocks Brooke; a second click is idempotent", async () => {
    await maybeOfferBrookeIntroduction(db.client, user, carlyConv, { initiation: false });
    showOffer();
    expect((await respondToBrookeIntroduction(db.client, user, true))).toEqual({ status: "contact_accepted", changed: true });
    expect((await respondToBrookeIntroduction(db.client, user, false))).toEqual({ status: "contact_accepted", changed: false });
    expect(contactUnlocked("brooke", (await introductionRow(db.client, user))!.status)).toBe(true);
  });
  it("declining keeps Brooke hidden, has no penalty and is final", async () => {
    await maybeOfferBrookeIntroduction(db.client, user, carlyConv, { initiation: false });
    showOffer();
    expect((await respondToBrookeIntroduction(db.client, user, false)).status).toBe("declined");
    expect((await respondToBrookeIntroduction(db.client, user, true)).status).toBe("declined");
    expect(contactUnlocked("brooke", "declined")).toBe(false);
    expect(await maybeOfferBrookeIntroduction(db.client, user, carlyConv, { initiation: false })).toBe(false);
    expect(offers()).toHaveLength(1);
  });
  it("refuses to respond before any offer", async () => {
    await expect(respondToBrookeIntroduction(db.client, user, true)).rejects.toThrow(/hasn't offered/);
  });
  it("cannot accept a staged or still-hidden offer", async () => {
    db.tables.after_dark_introductions.push({ user_id: user, status: "text_offered", brooke_consented: true, offer_message_id: null });
    await expect(respondToBrookeIntroduction(db.client, user, true)).rejects.toThrow(/visible offer/);
  });
  it("does not treat an unrelated completed outing as moving help", async () => {
    db.tables.after_dark_introductions.push({ user_id: user, status: "contact_accepted", brooke_consented: true });
    db.tables.conversations.push({ id: brookeConv, user_id: user, character_id: "brooke-id" });
    db.tables.living_experiences.push({ id: "movie", user_id: user, conversation_id: brookeConv, plan_id: "movie-plan", state: "completed", updated_at: "2026-11-10T20:00:00Z" });
    db.tables.social_plans = [{ id: "movie-plan", user_id: user, title: "Movie night" }];
    expect(await reconcileBrookeMeeting(db.client, user)).toBe(false);
  });
  it("marks the first meeting only after a completed outing in Brooke's thread", async () => {
    await maybeOfferBrookeIntroduction(db.client, user, carlyConv, { initiation: false });
    showOffer();
    await respondToBrookeIntroduction(db.client, user, true);
    db.tables.conversations!.push({ id: brookeConv, user_id: user, character_id: "brooke-id" });
    // Texting before the move does not count as meeting.
    expect(await reconcileBrookeMeeting(db.client, user)).toBe(false);
    db.tables.social_plans.push({ id: "moving-plan", user_id: user, title: "Help Brooke move furniture" });
    db.tables.living_experiences!.push({ id: "e1", user_id: user, conversation_id: brookeConv, plan_id: "moving-plan", state: "scheduled", updated_at: "2026-11-10T20:00:00Z" });
    expect(await reconcileBrookeMeeting(db.client, user)).toBe(false);
    db.tables.living_experiences![0]!.state = "completed";
    expect(await reconcileBrookeMeeting(db.client, user)).toBe(true);
    expect((await introductionRow(db.client, user))!.status).toBe("met");
    expect(await reconcileBrookeMeeting(db.client, user)).toBe(false);
  });
  it("does not count hidden Carly messages as a meaningful exchange", async () => {
    db.tables.messages.filter((m: any) => m.sender === "tess").forEach((m: any) => { m.visible_at = "2099-01-01T00:00:00Z"; });
    expect(await maybeOfferBrookeIntroduction(db.client, user, carlyConv, { initiation: false })).toBe(false);
  });
});

describe("0072 migration compatibility", () => {
  it("applies twice on an existing installation and enforces the introduction rules", async () => {
    const pg = new PGlite();
    const sig = (name: string, args: string, ret = "integer") =>
      `CREATE FUNCTION public.${name}(${args}) RETURNS ${ret} LANGUAGE plpgsql AS $f$ BEGIN IF 'x' IN ('kendra','jade') THEN NULL; END IF; RETURN NULL; END $f$;`;
    await pg.exec(`CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE TABLE public.characters(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text UNIQUE, preferred_name text, full_name text, age int, pronouns text, avatar_key text, zip text, sort_order int, enabled boolean DEFAULT true);
      INSERT INTO public.characters(key,preferred_name) VALUES ('jade','Jade');
      CREATE TABLE public.character_voices(character_key text);
      CREATE TABLE public.photo_reference_state(character_key text);
      CREATE TABLE public.spicy_photo_jobs(character_key text);
      ${sig("experience_seed", "uuid,timestamptz")}
      CREATE FUNCTION public.protect_living_plan() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF 'x' IN ('kendra','jade') THEN NULL; END IF; RETURN NEW; END $f$;
      ${sig("venue_reconcile_departures", "uuid,timestamptz")}
      ${sig("relationship_player_command", "uuid,uuid,text,text,text,uuid")}
      ${sig("relationship_sync_character", "uuid,text")}
      ${sig("set_profile_media", "uuid,text,text,text,text,uuid")}
      ${sig("phone_command", "uuid,uuid,text,jsonb,timestamptz")}
      ${sig("spicy_photo_preferences", "uuid,text,boolean,boolean,integer")}`);
    const sql = readFileSync("drizzle/migrations/0072_after_dark_carly_brooke.sql", "utf8");
    await pg.exec(sql);
    await pg.exec(sql); // idempotent re-run
    const chars = await pg.query<{ key: string }>("SELECT key FROM public.characters ORDER BY sort_order NULLS FIRST");
    expect(chars.rows.map(r => r.key)).toEqual(["jade", "carly", "brooke"]);
    const fn = await pg.query<{ d: string }>("SELECT pg_get_functiondef('public.phone_command(uuid,uuid,text,jsonb,timestamptz)'::regprocedure) d");
    expect(fn.rows[0]!.d).toContain("'kendra','jade','carly','brooke'");
    await pg.exec("INSERT INTO public.spicy_photo_jobs VALUES ('carly'),('brooke')");
    await expect(pg.exec("INSERT INTO public.spicy_photo_jobs VALUES ('ben')")).rejects.toThrow();
    const u = "30000000-0000-4000-8000-000000000001";
    await expect(pg.query("INSERT INTO public.after_dark_introductions(user_id,status) VALUES ($1,'contact_accepted')", [u])).rejects.toThrow();
    await expect(pg.query("INSERT INTO public.after_dark_introductions(user_id,status) VALUES ($1,'bogus')", [u])).rejects.toThrow();
    await pg.query("INSERT INTO public.after_dark_introductions(user_id,status,brooke_consented) VALUES ($1,'contact_accepted',true)", [u]);
  }, 30000);
});
