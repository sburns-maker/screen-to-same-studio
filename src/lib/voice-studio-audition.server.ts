import { keepAlive } from "./request-context.server";
import { AUDITION_LIMIT_MS } from "./voice-studio-audition";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

type Sideband = {
  send: (data: string) => void;
  close: () => void;
  onMessage: (fn: (data: string) => void) => void;
  onEnd: (fn: () => void) => void;
};

/** Server attach socket for an existing GPT-Live session (documented `/attach`). */
export async function attachSideband(sessionId: string, key: string): Promise<Sideband> {
  const path = `api.openai.com/v1/live/sessions/${encodeURIComponent(sessionId)}/attach`;
  const headers = { Authorization: `Bearer ${key}` };
  if (typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== "undefined") {
    // Cloudflare Workers: outbound WebSocket via fetch upgrade.
    const res = await fetch(`https://${path}`, { headers: { ...headers, Upgrade: "websocket" } });
    const ws = (res as Response & { webSocket?: WebSocket & { accept(): void } }).webSocket;
    if (!ws) throw new Error(`Sideband attach failed (HTTP ${res.status})`);
    ws.accept();
    return wrap(ws);
  }
  // Node (dev server): undici WebSocket accepts headers.
  const Ctor = globalThis.WebSocket as unknown as new (u: string, o: object) => WebSocket;
  const ws = new Ctor(`wss://${path}`, { headers });
  await new Promise<void>((ok, bad) => {
    ws.addEventListener("open", () => ok(), { once: true });
    ws.addEventListener("error", () => bad(new Error("Sideband attach failed")), { once: true });
  });
  return wrap(ws);
}

function wrap(ws: WebSocket): Sideband {
  return {
    send: (d) => ws.send(d),
    close: () => {
      try {
        ws.close(1000, "audition ended");
      } catch {
        /* already closed */
      }
    },
    onMessage: (fn) => ws.addEventListener("message", (e) => fn(String(e.data))),
    onEnd: (fn) => {
      ws.addEventListener("close", fn);
      ws.addEventListener("error", fn);
    },
  };
}

async function finish(
  db: Admin,
  id: string,
  patch: { state: "closed" | "failed"; close_reason: string; usage_seconds?: number | null },
) {
  await db
    .from("voice_studio_auditions")
    .update({ ...patch, ended_at: new Date().toISOString() })
    .eq("id", id)
    .in("state", ["reserved", "active"]);
}

/**
 * Server-owned deadline: sends session.close at the deadline regardless of the
 * browser, and records final usage from session.closed. Never reconnects.
 */
export function superviseAudition(
  db: Admin,
  row: { id: string; sessionId: string; deadline: number },
  key: string,
) {
  const work = (async () => {
    let sb: Sideband;
    try {
      sb = await attachSideband(row.sessionId, key);
    } catch (e) {
      console.error("audition supervisor attach failed", e);
      return;
    }
    await db.from("voice_studio_auditions").update({ supervised: true }).eq("id", row.id);
    await new Promise<void>((resolve) => {
      let done = false;
      const end = (reason: string, usage?: number | null) => {
        if (done) return;
        done = true;
        clearTimeout(deadline);
        clearTimeout(drain);
        sb.close();
        void finish(db, row.id, { state: "closed", close_reason: reason, usage_seconds: usage })
          .catch(() => {})
          .finally(resolve);
      };
      sb.onMessage((data) => {
        try {
          const ev = JSON.parse(data) as { type?: string; usage?: { seconds?: number } };
          if (ev.type === "session.closed") end("session_closed", ev.usage?.seconds ?? null);
        } catch {
          /* ignore non-JSON */
        }
      });
      sb.onEnd(() => end("sideband_ended"));
      let drain: ReturnType<typeof setTimeout> | undefined;
      const deadline = setTimeout(
        () => {
          try {
            sb.send(JSON.stringify({ type: "session.close" }));
          } catch {
            /* transport gone */
          }
          drain = setTimeout(() => end("deadline_unconfirmed"), 1_500);
        },
        Math.max(0, row.deadline - Date.now() - 1_500),
      );
    });
  })();
  return keepAlive(work);
}

/** Explicit Stop / cleanup: close at OpenAI from the server, never retry. */
export async function closeAuditionSession(db: Admin, id: string, sessionId: string | null, key: string) {
  if (sessionId) {
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
  await finish(db, id, { state: "closed", close_reason: "user_stop" });
}

export { AUDITION_LIMIT_MS };
