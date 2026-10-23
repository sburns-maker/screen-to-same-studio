/** Direct OpenAI GPT-Live data-channel protocol, not the Realtime protocol. */
export const AUDITION_SCRIPT =
  "I have a complaint. About you, obviously. I haven't decided what you've done wrong yet, but I'm confident I'll find something. Have a lovely day.";
export const AUDITION_LIMIT_MS = 45_000;
// Fail closed: the current one-shot SDP endpoint has no durable concurrency
// reservation or server-owned connection enforcing a paid-session deadline.
export const AUDITION_SERVER_SAFEGUARDS_READY = false;

export function assertAuditionAllowed(developer: boolean, env: Record<string, string | undefined>) {
  if (!developer) throw new Error("Developer access required");
  if (env["ENABLE_VOICE_DESIGN"] !== "true" || env["ENABLE_VOICE_STUDIO_AUDITIONS"] !== "true") {
    throw new Error("Studio auditions are disabled");
  }
  if (!AUDITION_SERVER_SAFEGUARDS_READY) {
    throw new Error(
      "Paid auditions are blocked until server-side duration, concurrency and spending safeguards are installed.",
    );
  }
  if (!env["OPENAI_API_KEY"]) throw new Error("OpenAI is not configured");
}

export type AuditionState = "connecting" | "ready" | "playing" | "blocked" | "stopping" | "closed";

/** No paid request is made until start is called explicitly by the UI. */
export function createStudioAudition(options: {
  audio: HTMLAudioElement;
  connect: (sdp: string) => Promise<{ sdp: string }>;
  onState: (state: AuditionState) => void;
  onError: (message: string) => void;
}) {
  const pc = new RTCPeerConnection();
  const channel = pc.createDataChannel("oai-events");
  let state: AuditionState = "connecting";
  let requested = false;
  let limit: ReturnType<typeof setTimeout> | undefined;
  let drain: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let startup: ReturnType<typeof setTimeout> | undefined;
  let lastTime = 0;

  function update(next: AuditionState) {
    state = next;
    options.onState(next);
  }
  function active() {
    return state !== "stopping" && state !== "closed";
  }
  function silence() {
    options.audio.pause();
    options.audio.srcObject = null;
  }
  function release() {
    if (state === "closed") return;
    // Best-effort remote shutdown on route teardown or document exit.
    if (active() && channel.readyState === "open") {
      try { channel.send(JSON.stringify({ type: "session.close" })); } catch { /* transport lost */ }
    }
    clearTimeout(limit);
    clearTimeout(drain);
    clearTimeout(startup);
    clearInterval(poll);
    window.removeEventListener("pagehide", release);
    silence();
    update("closed");
    channel.close();
    pc.close();
  }
  function stop() {
    if (!active()) return;
    update("stopping");
    clearTimeout(limit);
    clearTimeout(startup);
    clearInterval(poll);
    silence();
    if (channel.readyState !== "open") return release();
    try {
      channel.send(JSON.stringify({ type: "session.close" }));
    } catch {
      return release();
    }
    // Receive final session.closed while the speaker is already silent.
    drain = setTimeout(() => {
      options.onError("Stopped locally; OpenAI did not confirm final session closure.");
      release();
    }, 15_000);
  }
  function fail(message: string) {
    if (!active()) return;
    options.onError(message);
    stop();
  }
  async function resume() {
    if (!active() || !options.audio.srcObject) return;
    try {
      await options.audio.play();
    } catch {
      if (active()) update("blocked");
    }
  }
  function observePlayback() {
    if (!active() || !options.audio.srcObject || options.audio.paused) return;
    const now = options.audio.currentTime;
    // Neither an SDP answer nor play() resolving proves media has played.
    if (now > lastTime && options.audio.readyState >= 2) update("playing");
    lastTime = now;
  }
  pc.addTransceiver("audio", { direction: "recvonly" });
  pc.ontrack = ({ track }) => {
    if (!active()) return;
    options.audio.srcObject = new MediaStream([track]);
    void resume();
  };
  pc.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
      fail("Audition connection lost. Start a new audition to retry.");
    }
  };
  channel.onmessage = ({ data }) => {
    try {
      const event = JSON.parse(String(data)) as { type?: string; error?: { message?: string } };
      if (event.type === "session.closed") return release();
      if (!active()) return;
      if (event.type === "error")
        return fail(
          "OpenAI rejected the audition command. Stop and review provider access or configuration.",
        );
      if (event.type === "session.started" && !requested) {
        requested = true;
        clearTimeout(startup);
        update("ready");
        channel.send(
          JSON.stringify({
            type: "session.commentary.append",
            event_id: crypto.randomUUID(),
            delegation_id: null,
            content: AUDITION_SCRIPT,
          }),
        );
      }
    } catch {
      fail("Unexpected OpenAI audition event.");
    }
  };
  channel.onclose = () => {
    if (active()) options.onError("Audition disconnected without confirmed final session closure.");
    release();
  };
  channel.onerror = () => fail("Audition data connection failed.");
  window.addEventListener("pagehide", release);

  async function start() {
    options.onState("connecting");
    limit = setTimeout(stop, AUDITION_LIMIT_MS);
    startup = setTimeout(
      () => fail("Audition did not start. No automatic retry was made."),
      30_000,
    );
    poll = setInterval(observePlayback, 250);
    // Try unlocking the mounted audio element while still in the click gesture.
    void options.audio.play().catch(() => {});
    try {
      await pc.setLocalDescription(await pc.createOffer());
      if (!active()) return;
      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error("Missing audition offer");
      const answer = await options.connect(sdp);
      if (!active()) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    } catch (e) {
      fail(e instanceof Error ? e.message : "Audition failed");
    }
  }
  return { start, stop, release, resume };
}
