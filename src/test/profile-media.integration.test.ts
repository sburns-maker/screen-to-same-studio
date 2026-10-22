// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
import { canonicalProfile } from "@/lib/canonical-profile.server";
import { currentCanonical, saveProfileMedia, decodePortrait } from "@/lib/profile-media.server";
import { registerPrimaryIdentity } from "@/lib/visual-profiles.server";
let db: Awaited<ReturnType<typeof worldDatabase>>, admin: SupabaseClient<Database>;
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002";
const files = new Map<string, Uint8Array>();
let avatar: string, reference: string;
beforeAll(async () => {
  db = await worldDatabase();
  const base = postgresSupabase(db).admin;
  admin = {
    ...base,
    storage: {
      getBucket: async () => ({ data: { public: false }, error: null }),
      from: () => ({
        upload: async (path: string, bytes: Uint8Array) => {
          files.set(path, bytes);
          await db.query(
            "insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'tess-photos',$1)",
            [path],
          );
          return { error: null };
        },
        download: async (path: string) => ({
          data: files.has(path)
            ? new Blob([files.get(path)! as Uint8Array<ArrayBuffer>], { type: "image/jpeg" })
            : null,
          error: files.has(path) ? null : new Error("missing"),
        }),
      }),
    },
  } as unknown as SupabaseClient<Database>;
  const original = new Uint8Array(await (await canonicalProfile("tess")).blob.arrayBuffer());
  avatar = Buffer.from(original).toString("base64");
  reference = Buffer.concat([original, Buffer.from([0])]).toString("base64");
}, 30000);
beforeEach(async () => {
  files.clear();
  await db.exec(
    "TRUNCATE conversations CASCADE; TRUNCATE visual_identity_registry; TRUNCATE profile_identity_changes; TRUNCATE storage.objects;",
  );
  for (const key of ["tess", "maya"])
    await db.query(
      "insert into conversations(user_id,character_id) select $1,id from characters where key=$2",
      [user, key],
    );
});
afterAll(async () => {
  vi.restoreAllMocks();
  await db.close();
});
describe("persistent display avatars and explicit canonical changes", () => {
  it("persists a cropped avatar without changing the canonical bytes or conversation history", async () => {
    const original = await canonicalProfile("tess");
    await saveProfileMedia(admin, user, { key: "tess", avatar, canonicalApproved: false });
    const row = (
      await db.query<{ canonical_asset: string; active_storage_path: string }>(
        "select * from visual_identity_registry where user_id=$1 and entity_key=$2",
        [user, "tess"],
      )
    ).rows[0]!;
    expect(row.active_storage_path).toContain(`${user}/profile/tess/`);
    expect(row.canonical_asset).toBe(original.asset);
    expect((await currentCanonical(admin, user, "tess")).sha256).toBe(original.sha256);
    expect((await db.query("select * from messages")).rows).toHaveLength(0);
  });
  it("changes future reference bytes only after explicit approval and retains the original asset", async () => {
    const original = await canonicalProfile("tess");
    await saveProfileMedia(admin, user, {
      key: "tess",
      avatar,
      reference,
      canonicalApproved: true,
    });
    const approved = await currentCanonical(admin, user, "tess");
    expect(approved.sha256).not.toBe(original.sha256);
    expect(approved.asset).toContain("/profile/tess/");
    expect(Buffer.from(await approved.blob.arrayBuffer()).toString("base64")).toBe(reference);
    expect((await registerPrimaryIdentity(admin, user, "tess")).sha256).toBe(approved.sha256);
    expect((await canonicalProfile("tess")).sha256).toBe(original.sha256);
    expect((await currentCanonical(admin, user, "maya")).asset).toBe(
      (await canonicalProfile("maya")).asset,
    );
    const audit = (
      await db.query<{ canonical_changed: boolean }>("select * from profile_identity_changes")
    ).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]!.canonical_changed).toBe(true);
  });
  it("rejects unapproved replacements, malformed references and unowned characters before uploads", async () => {
    await expect(
      saveProfileMedia(admin, user, { key: "tess", avatar, reference, canonicalApproved: false }),
    ).rejects.toThrow("approval");
    await expect(
      saveProfileMedia(admin, other, { key: "tess", avatar, canonicalApproved: false }),
    ).rejects.toThrow("Owned");
    expect(() => decodePortrait(btoa("not an image"))).toThrow();
    expect(files.size).toBe(0);
  });
  it("refuses another character’s received photo or a hidden/forged source message", async () => {
    const mid = crypto.randomUUID();
    await db.query(
      "insert into messages(id,conversation_id,user_id,sender,body,metadata) select $1,c.id,$2,'tess','Photo','{\"generated_path\":\"some-photo\"}'::jsonb from conversations c join characters ch on ch.id=c.character_id where c.user_id=$2 and ch.key='maya'",
      [mid, user],
    );
    await expect(
      saveProfileMedia(admin, user, {
        key: "tess",
        avatar,
        sourceMessageId: mid,
        canonicalApproved: false,
      }),
    ).rejects.toThrow("received photo");
    expect(files.size).toBe(0);
  });
  it("fails closed when the approved private reference is missing or altered", async () => {
    await saveProfileMedia(admin, user, {
      key: "tess",
      avatar,
      reference,
      canonicalApproved: true,
    });
    const c = await currentCanonical(admin, user, "tess");
    files.set(c.asset, Buffer.from(avatar, "base64"));
    await expect(currentCanonical(admin, user, "tess")).rejects.toThrow("integrity");
    files.delete(c.asset);
    await expect(currentCanonical(admin, user, "tess")).rejects.toThrow("missing");
  });
  it("prevents accidental reuse of the same approved identity across different characters", async () => {
    await saveProfileMedia(admin, user, {
      key: "tess",
      avatar,
      reference,
      canonicalApproved: true,
    });
    await expect(
      saveProfileMedia(admin, user, { key: "maya", avatar, reference, canonicalApproved: true }),
    ).rejects.toThrow("cannot be shared");
    expect((await currentCanonical(admin, user, "maya")).asset).toBe(
      (await canonicalProfile("maya")).asset,
    );
  });
  it("enforces service-only mutations, owner RLS and private-path validation in SQL", async () => {
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('authenticated','public.set_profile_media(uuid,text,text,text,text,uuid)','EXECUTE') allowed",
        )
      ).rows[0]!.allowed,
    ).toBe(false);
    await registerPrimaryIdentity(admin, user, "tess");
    const r = await admin.rpc("set_profile_media", {
      p_user: user,
      p_key: "tess",
      p_avatar: `${other}/profile/tess/x.jpg`,
      p_canonical: null,
      p_sha: null,
      p_source: null,
    } as never);
    expect(r.error).not.toBeNull();
    const policy = (
      await db.query("select * from pg_policies where tablename='profile_identity_changes'")
    ).rows;
    expect(policy).toHaveLength(1);
  });
});
