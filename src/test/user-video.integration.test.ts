// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { worldDatabase, postgresSupabase } from "./pglite-supabase";
import { prepareVideo, finishVideo } from "@/lib/user-video.server";
const user = "10000000-0000-4000-a000-000000000001",
  other = "10000000-0000-4000-a000-000000000002",
  cid = "20000000-0000-4000-a000-000000000001";
const mp4 = new TextEncoder().encode("\u0000\u0000\u0000\u0018ftypisom0000");
let db: Awaited<ReturnType<typeof worldDatabase>>,
  admin: ReturnType<typeof postgresSupabase>["admin"];
let bytes = mp4,
  uploadCount = 0;
const request = () => ({
  id: crypto.randomUUID(),
  conversationId: cid,
  mime: "video/mp4",
  bytes: mp4.length,
  duration: 5,
  caption: "A short clip",
});
const count = async (table: string) =>
  (await db.query<{ n: number }>(`select count(*)::int n from ${table}`)).rows[0]!.n;
beforeAll(async () => {
  db = await worldDatabase();
}, 30000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("TRUNCATE conversations CASCADE;");
  await db.query(
    "insert into conversations(id,user_id,character_id) select $1,$2,id from characters where key='tess'",
    [cid, user],
  );
  await db.query(
    "insert into memories(conversation_id,user_id,summary) values($1,$2,'An established memory remains')",
    [cid, user],
  );
  const base = postgresSupabase(db).admin;
  bytes = mp4;
  uploadCount = 0;
  const storage = {
    getBucket: async () => ({ data: { public: false, file_size_limit: 25_000_000 }, error: null }),
    from: () => ({
      createSignedUploadUrl: async (path: string) => {
        uploadCount++;
        return { data: { path, token: "test-path-token" }, error: null };
      },
      download: async () => ({ data: new Blob([bytes as BlobPart]), error: null }),
    }),
  };
  admin = { ...base, storage } as unknown as typeof admin;
});
describe("private video attachment delivery", () => {
  it("reserves a path-scoped upload and persists a normal message without changing histories or invoking AI", async () => {
    const input = request(),
      reservation = await prepareVideo(admin, user, input);
    expect(reservation.path).toBe(`${user}/${input.id}.mp4`);
    expect(reservation.token).toBe("test-path-token");
    const delivered = await finishVideo(admin, user, input.id);
    expect(delivered.newlySent).toBe(true);
    expect(await count("messages")).toBe(1);
    expect(await count("memories")).toBe(1);
    expect(await count("generated_images")).toBe(0);
    const m = (
      await db.query<{
        body: string;
        metadata: { video_analysis: string; user_video: { mime: string } };
      }>("select * from messages")
    ).rows[0]!;
    expect(m.body).toBe(input.caption);
    expect(m.metadata.video_analysis).toBe("not_analyzed");
    expect(m.metadata.user_video.mime).toBe("video/mp4");
  });
  it("deduplicates completed and concurrent confirmation retries", async () => {
    const input = request();
    await prepareVideo(admin, user, input);
    const results = await Promise.all([
      finishVideo(admin, user, input.id),
      finishVideo(admin, user, input.id),
    ]);
    expect(results.filter((r) => r.newlySent)).toHaveLength(1);
    expect(await count("messages")).toBe(1);
    expect((await finishVideo(admin, user, input.id)).newlySent).toBe(false);
    expect((await prepareVideo(admin, user, input)).sent).toBe(true);
    expect(uploadCount).toBe(1);
  });
  it("rejects cross-user access and request reuse with a different conversation or caption", async () => {
    const input = request();
    await expect(prepareVideo(admin, other, input)).rejects.toThrow();
    await prepareVideo(admin, user, input);
    await expect(finishVideo(admin, other, input.id)).rejects.toThrow("Owned");
    await expect(prepareVideo(admin, user, { ...input, caption: "Changed" })).rejects.toThrow();
    expect(await count("messages")).toBe(0);
  });
  it("refuses spoofed or mismatched uploaded bytes before creating a message", async () => {
    const input = request();
    await prepareVideo(admin, user, input);
    bytes = new TextEncoder().encode("<script>bad</script>");
    await expect(finishVideo(admin, user, input.id)).rejects.toThrow("validation");
    expect(await count("messages")).toBe(0);
    bytes = new Uint8Array(mp4.length);
    await expect(finishVideo(admin, user, input.id)).rejects.toThrow("validation");
    expect(await count("messages")).toBe(0);
  });
  it("retains pending state if atomic message insertion fails, then retries only delivery", async () => {
    const input = request();
    await prepareVideo(admin, user, input);
    await db.exec(
      "CREATE FUNCTION video_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test'; END $$; CREATE TRIGGER video_test_fail BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION video_test_fail();",
    );
    try {
      await expect(finishVideo(admin, user, input.id)).rejects.toThrow("could not be confirmed");
      expect(await count("messages")).toBe(0);
      expect(
        (await db.query<{ status: string }>("select status from user_video_uploads")).rows[0]!
          .status,
      ).toBe("pending");
    } finally {
      await db.exec("DROP TRIGGER video_test_fail ON messages; DROP FUNCTION video_test_fail();");
    }
    expect((await finishVideo(admin, user, input.id)).newlySent).toBe(true);
    expect(uploadCount).toBe(1);
  });
  it("caps reservation attempts and keeps mutation RPCs service-only", async () => {
    for (let n = 0; n < 10; n++) await prepareVideo(admin, user, request());
    await expect(prepareVideo(admin, user, request())).rejects.toThrow("daily limit");
    expect(uploadCount).toBe(10);
    expect(
      (
        await db.query(
          "select has_function_privilege('authenticated','deliver_user_video(uuid,uuid)','execute') allowed",
        )
      ).rows[0],
    ).toEqual({ allowed: false });
    expect(
      (
        await db.query<{ public: boolean }>("select public from storage.buckets where id=$1", [
          "user-videos",
        ])
      ).rows[0]!.public,
    ).toBe(false);
  });
  it("does not silently use public or misconfigured storage", async () => {
    const unsafe = {
      ...admin,
      storage: {
        ...admin.storage,
        getBucket: async () => ({
          data: { public: true, file_size_limit: 25_000_000 },
          error: null,
        }),
      },
    } as unknown as typeof admin;
    await expect(prepareVideo(unsafe, user, request())).rejects.toThrow("Private video storage");
    expect(uploadCount).toBe(0);
  });
});
