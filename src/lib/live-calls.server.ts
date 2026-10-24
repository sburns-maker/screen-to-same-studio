import { attachSideband } from "./voice-studio-audition.server";
import { VOICE_ID_PATTERN, type LiveCallCharacter } from "./live-calls";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
// New tables are not in generated types yet; keep access in this module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loose = (db: Admin) => db as any;

export type CharacterVoice = { voiceId: string; label: string; source: "studio" | "server" };

/** Studio-set voice first, then the legacy server setting. */
export async function resolveCharacterVoice(db: Admin, key: LiveCallCharacter): Promise<CharacterVoice | null> {
  const r = await loose(db).from("character_voices").select("voice_id, label").eq("character_key", key).maybeSingle();
  if (!r.error && r.data && VOICE_ID_PATTERN.test(r.data.voice_id))
    return { voiceId: r.data.voice_id, label: r.data.label ?? "", source: "studio" };
  const env = process.env[`GPT_LIVE_VOICE_${key.toUpperCase()}`]?.trim();
  return env && VOICE_ID_PATTERN.test(env) ? { voiceId: env, label: "", source: "server" } : null;
}

export async function listCharacterVoices(db: Admin) {
  const r = await loose(db).from("character_voices").select("character_key, voice_id, label, updated_at");
  return (r.data ?? []) as { character_key: string; voice_id: string; label: string; updated_at: string }[];
}

export async function saveCharacterVoice(db: Admin, key: LiveCallCharacter, voiceId: string, label: string, by: string) {
  const r = await loose(db)
    .from("character_voices")
    .upsert({ character_key: key, voice_id: voiceId, label, set_by: by, updated_at: new Date().toISOString() });
  if (r.error) throw new Error("Could not save the phone voice");
}

export function liveCalls(db: Admin) {
  return loose(db).from("live_character_calls");
}

async function sendClose(sessionId: string, key: string) {
  try {
    const sb = await attachSideband(sessionId, key);
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 4_000);
      sb.onMessage((d) => {
        if (d.includes('"session.closed"')) {
          clearTimeout(t);
          resolve();
        }
      });
      sb.onEnd(() => {
        clearTimeout(t);
        resolve();
      });
      sb.send(JSON.stringify({ type: "session.close" }));
    });
    sb.close();
  } catch {
    /* session may already be gone */
  }
}

/** Close at OpenAI from the server and finish the ledger row. Never reconnects. */
export async function closeLiveCall(
  db: Admin,
  row: { id: string; session_id: string | null },
  reason: string,
  state: "closed" | "failed" = "closed",
) {
  const key = process.env["OPENAI_API_KEY"];
  if (row.session_id && key) await sendClose(row.session_id, key);
  await liveCalls(db)
    .update({ state, close_reason: reason, ended_at: new Date().toISOString() })
    .eq("id", row.id)
    .in("state", ["reserved", "active"]);
}

/** Scheduled backstop: closes any call whose server deadline has passed. */
export async function sweepOverdueLiveCalls(db: Admin, now = new Date()) {
  const r = await liveCalls(db)
    .select("id, session_id")
    .in("state", ["reserved", "active"])
    .lt("deadline_at", new Date(now.getTime() - 5_000).toISOString())
    .limit(20);
  for (const row of (r.data ?? []) as { id: string; session_id: string | null }[])
    await closeLiveCall(db, row, "deadline_sweep");
  return (r.data ?? []).length as number;
}
