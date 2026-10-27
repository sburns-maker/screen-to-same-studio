// @vitest-environment node
import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
import { portraitHash } from "@/lib/profile-media.server";
import { canonicalProfile } from "@/lib/canonical-profile.server";
import { registerPrimaryIdentity } from "@/lib/visual-profiles.server";
import {
  referenceLibraryPage,
  referencePreview,
  reviewReference,
  approvedProviderReferences,
  PROVIDER_REFERENCE_TTL,
  referenceProviderPreference,
} from "@/lib/photo-reference-library.server";
let db: Awaited<ReturnType<typeof worldDatabase>>, admin: SupabaseClient<Database>;
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002",
  cid = "20000000-0000-4000-a000-000000000001",
  id = () => crypto.randomUUID();
let hash: string, bytes: Uint8Array;
const files = new Map<string, Blob>(),
  signed = vi.fn();
beforeAll(async () => {
  db = await worldDatabase();
  await db.exec(`CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('request.jwt.claim.role',true),'service_role') $$;
 CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon;
 `);
  await db.exec(
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated;",
  );
  await db.exec(readFileSync("drizzle/migrations/0047_photo_reference_library.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0048_api18_generation_jobs.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0051_spicy_photo_tasks.sql", "utf8"));
  const base = postgresSupabase(db).admin;
  admin = {
    ...base,
    storage: {
      getBucket: async () => ({ data: { public: false }, error: null }),
      from: () => ({
        download: async (path: string) => ({
          data: files.get(path) ?? null,
          error: files.has(path) ? null : { message: "missing" },
        }),
        upload: async (path: string, b: Uint8Array, options: { contentType: string }) => {
          files.set(path, new Blob([new Uint8Array(b)], { type: options.contentType }));
          return { error: null };
        },
        createSignedUrl: signed,
      }),
    },
  } as unknown as SupabaseClient<Database>;
  const canonical = await canonicalProfile("tess");
  hash = canonical.sha256;
  bytes = new Uint8Array(await canonical.blob.arrayBuffer());
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "TRUNCATE job_runs CASCADE;TRUNCATE photo_reference_state CASCADE;TRUNCATE conversations CASCADE;TRUNCATE visual_identity_registry CASCADE;TRUNCATE storage.objects; RESET ROLE; RESET request.jwt.claim.role; RESET request.jwt.claim.sub;",
  );
  // RESET leaves an empty claim in PostgreSQL: explicitly set service role for normal app operations.
  await db.exec("SET request.jwt.claim.role='service_role'");
  await db.query(
    "insert into conversations(id,user_id,character_id,last_read_at) select $1,$2,id,now() from characters where key='tess'",
    [cid, user],
  );
  files.clear();
  signed.mockReset().mockImplementation(async (path: string, seconds: number) => ({
    data: {
      signedUrl: `https://storage.example.com/object/sign/tess-photos/${path}?token=private&ttl=${seconds}`,
    },
    error: null,
  }));
  await registerPrimaryIdentity(admin, user, "tess");
});
async function photo(key = "tess", path = `${user}/${id()}.png`, canonicalHash = hash) {
  const mid = id(),
    gid = id();
  await db.query(
    "insert into generated_images(id,user_id,conversation_id,photo_type,scene,provider,model,storage_path) values($1,$2,$3,'casual_selfie','home','mock','mock',$4)",
    [gid, user, cid, path],
  );
  const metadata = {
    generated_path: path,
    generated_image_id: gid,
    photo_type: "casual_selfie",
    photo_identity: { canonicalSha256: canonicalHash, validationStatus: "screen_passed" },
    photo_visual: { character: key },
  };
  await db.query(
    "insert into messages(id,user_id,conversation_id,sender,body,visible_at,metadata) values($1,$2,$3,'tess','photo',now()-interval '1 minute',$4)",
    [mid, user, cid, metadata],
  );
  await db.query("insert into storage.objects(id,bucket_id,name) values($1,'tess-photos',$2)", [
    id(),
    path,
  ]);
  const content = new Uint8Array([...bytes, ...new TextEncoder().encode(mid)]);
  files.set(path, new Blob([content], { type: "image/jpeg" }));
  return { mid, path, contentHash: await portraitHash(content) };
}
async function review(
  action: "approve" | "reject" | "remove" | "undo",
  message: string | null,
  role: "canonical" | "half_body" | "alternate_angle" | null = "half_body",
  actionId = id(),
) {
  const page = await referenceLibraryPage(admin, user, "tess");
  return reviewReference(admin, user, {
    id: actionId,
    character: "tess",
    action,
    role,
    message,
    hash: page.hash,
    version: page.version,
    undo: action === "undo" ? page.lastAction : null,
    visualConfirmed: true,
    reviewedSha: message ? (await referencePreview(admin, user, "tess", message)).sha256 : hash,
  });
}
describe("persistent owner-scoped reference library", () => {
  it("installs without backfill and keeps canonical and generated reviews independent", async () => {
    expect((await referenceLibraryPage(admin, user, "tess")).approved).toBe(0);
    const p = await photo();
    await review("approve", null, "canonical");
    await review("approve", p.mid);
    const page = await referenceLibraryPage(admin, user, "tess");
    expect(page.approved).toBe(2);
    expect(page.status).toContain("partial");
    expect((await db.query<{ n: number }>("select count(*)::int n from messages")).rows[0]!.n).toBe(
      1,
    );
    expect((await canonicalProfile("tess")).sha256).toBe(hash);
  });
  it("rejects cross-user, wrong-character, unread, unproven and invalid-path candidates", async () => {
    const wrong = await photo("maya");
    await expect(review("approve", wrong.mid)).rejects.toThrow("Reference is missing");
    const otherPath = await photo("tess", `${other}/wrong.png`);
    await expect(review("approve", otherPath.mid)).rejects.toThrow();
    const traversal = await photo("tess", `${user}/../wrong.png`);
    await expect(review("approve", traversal.mid)).rejects.toThrow();
    const unread = await photo();
    await db.query("update conversations set last_read_at='2000-01-01' where id=$1", [cid]);
    await expect(review("approve", unread.mid)).rejects.toThrow();
    expect((await referenceLibraryPage(admin, user, "tess")).candidates).toHaveLength(1);
    await expect(referenceLibraryPage(admin, other, "tess")).rejects.toThrow("Owned conversation");
  });
  it("does not show future or incompatible canonical photos and blocks outdated approval", async () => {
    const mismatch = await photo("tess", `${user}/wrong-hash.png`, "b".repeat(64));
    await expect(review("approve", mismatch.mid)).rejects.toThrow();
    const future = await photo();
    await db.query("update messages set visible_at=now()+interval '1 day' where id=$1", [
      future.mid,
    ]);
    expect((await referenceLibraryPage(admin, user, "tess")).candidates).toHaveLength(1);
  });
  it("persists rejection, prevents reuse and duplicates, supports guarded undo", async () => {
    const p = await photo();
    await review("approve", p.mid);
    await expect(review("approve", p.mid, "alternate_angle")).rejects.toThrow();
    await review("reject", p.mid);
    expect(
      (await referenceLibraryPage(admin, user, "tess")).candidates.find((c) => c.id === p.mid)
        ?.rejected,
    ).toBe(true);
    await expect(review("approve", p.mid)).rejects.toThrow();
    await review("undo", null);
    expect((await referenceLibraryPage(admin, user, "tess")).slots[0]?.source_message_id).toBe(
      p.mid,
    );
  });
  it("fences concurrent revisions, replays identical actions and requires visual confirmation", async () => {
    const p = await photo(),
      page = await referenceLibraryPage(admin, user, "tess"),
      input = {
        id: id(),
        character: "tess" as const,
        action: "approve" as const,
        role: "half_body" as const,
        message: p.mid,
        hash,
        version: page.version,
        undo: null,
        visualConfirmed: true,
        reviewedSha: p.contentHash,
      };
    await expect(
      reviewReference(admin, user, { ...input, visualConfirmed: false }),
    ).rejects.toThrow("Confirm a clear face");
    await reviewReference(admin, user, input);
    await reviewReference(admin, user, input);
    await expect(reviewReference(admin, user, { ...input, id: id() })).rejects.toThrow();
    expect((await db.query("select * from photo_reference_actions")).rows).toHaveLength(1);
  });
  it("serves private preview bytes and ordered approved URLs only on the server", async () => {
    const p = await photo(),
      angle = await photo();
    expect((await referencePreview(admin, user, "tess", p.mid)).image).toMatch(
      /^data:image\/jpeg;base64,/,
    );
    expect(signed).not.toHaveBeenCalled();
    await review("approve", null, "canonical");
    await review("approve", p.mid, "half_body");
    await review("approve", angle.mid, "alternate_angle");
    const refs = await approvedProviderReferences(admin, user, "tess");
    expect(refs).toHaveLength(3);
    expect(signed.mock.calls.map((c) => c[0])).toEqual([
      `${user}/reference-library/tess/${hash}.jpg`,
      p.path,
      angle.path,
    ]);
    expect(signed.mock.calls.every((c) => c[1] === PROVIDER_REFERENCE_TTL)).toBe(true);
    expect((await referenceLibraryPage(admin, user, "tess")).approved).toBe(3);
  });
  it("fails closed on missing storage and canonical changes after approval", async () => {
    const p = await photo();
    await review("approve", null, "canonical");
    await review("approve", p.mid);
    files.delete(p.path);
    await expect(approvedProviderReferences(admin, user, "tess")).rejects.toThrow("file missing");
    await db.query("update visual_identity_registry set canonical_sha256=$1 where user_id=$2", [
      "c".repeat(64),
      user,
    ]);
    await expect(referencePreview(admin, user, "tess", p.mid)).rejects.toThrow("integrity");
  });
  it("enforces owner SELECT RLS and rejects browser writes or anonymous RPC execution", async () => {
    await review("approve", null, "canonical");
    await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${other}';`);
    expect((await db.query("select * from photo_reference_slots")).rows).toHaveLength(0);
    await db.exec(`SET request.jwt.claim.sub='${user}';`);
    expect((await db.query("select * from photo_reference_slots")).rows).toHaveLength(1);
    await expect(db.query("delete from photo_reference_slots")).rejects.toThrow(
      "permission denied",
    );
    await expect(
      db.query("select photo_reference_candidate($1,'tess',null,$2)", [user, hash]),
    ).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE;SET request.jwt.claim.role='anon'");
    await expect(
      db.query("select photo_reference_candidate($1,'tess',null,$2)", [user, hash]),
    ).rejects.toThrow("service role required");
  });
});

it("requires re-review if immutable reference content changes after approval", async () => {
  const p = await photo();
  await review("approve", null, "canonical");
  await review("approve", p.mid);
  files.set(p.path, new Blob([new Uint8Array([...bytes, 0])], { type: "image/jpeg" }));
  await expect(approvedProviderReferences(admin, user, "tess")).rejects.toThrow("bytes changed");
});
it("does not enable an unverified provider through a client preference", async () => {
  await expect(referenceProviderPreference(admin, user, "tess", true, true, 0)).rejects.toThrow(
    "incomplete",
  );
  expect((await referenceLibraryPage(admin, user, "tess")).spicyEnabled).toBe(false);
});

it("rejects the same approved bytes under a different storage path", async () => {
  const first = await photo(),
    second = await photo();
  files.set(second.path, files.get(first.path)!);
  await review("approve", first.mid, "half_body");
  await expect(review("approve", second.mid, "alternate_angle")).rejects.toThrow(
    "Review could not",
  );
});
