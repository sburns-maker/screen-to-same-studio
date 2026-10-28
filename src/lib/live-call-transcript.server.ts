import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { transcriptSchema, type TranscriptLine } from "./live-calls";

/** Immutable completed lines, in the existing private conversation; never runs a model. */
export async function persistLiveCallTranscript(
  db: SupabaseClient<Database>,
  user: string,
  callId: string,
  input: TranscriptLine[],
  final = false,
): Promise<{ saved: number }> {
  const lines = transcriptSchema.parse(input);
  const call = await db
    .from("live_character_calls" as never)
    .select("id,user_id,conversation_id,character_key")
    .eq("id", callId)
    .eq("user_id", user)
    .maybeSingle();
  const owned = call.data as {
    id: string;
    user_id: string;
    conversation_id: string;
    character_key: string;
  } | null;
  if (call.error || !owned || owned.user_id !== user || owned.id !== callId)
    throw new Error("Call not found");
  const conversation = await db
    .from("conversations")
    .select("id,user_id,character:characters(key)")
    .eq("id", owned.conversation_id)
    .eq("user_id", user)
    .maybeSingle();
  const character = conversation.data?.character as { key?: string } | null;
  if (conversation.error || !conversation.data || character?.key !== owned.character_key)
    throw new Error("Call conversation mismatch");
  // The newest line may still receive deltas. Checkpoint only earlier lines;
  // final hang-up includes the last one. Do not rewrite any previously saved line.
  const complete = final ? lines : lines.slice(0, -1);
  const now = Date.now();
  const rows = await Promise.all(
    complete.map(async (line, index) => {
      const hash = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(`live-call:${callId}:line:${index}`),
        ),
      );
      hash[6] = (hash[6]! & 15) | 80;
      hash[8] = (hash[8]! & 63) | 128;
      const hex = Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      // Recorded order, not an invented claim about exact spoken-word timing.
      const at = new Date(now - (complete.length - index)).toISOString();
      return {
        id,
        user_id: user,
        conversation_id: owned.conversation_id,
        sender: line.role === "user" ? "user" : "tess",
        body: line.text,
        created_at: at,
        visible_at: at,
        metadata: {
          channel: "voice",
          live_call_id: callId,
          transcript_ordinal: index,
          transcript_source: "live_call_capture",
          push_primary: false,
        },
      };
    }),
  );
  const nonempty = rows.filter((row) => row.body.trim());
  if (!nonempty.length) return { saved: 0 };
  const result = await db
    .from("messages")
    .upsert(nonempty, { onConflict: "id", ignoreDuplicates: true });
  if (result.error) throw new Error("Call transcript save failed");
  return { saved: nonempty.length };
}
