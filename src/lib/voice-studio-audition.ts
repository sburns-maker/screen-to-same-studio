import { auditionReinforcement, type ConversationalOptions, type AuditionMode } from "./voice-audition-modes";

/** Direct OpenAI GPT-Live data-channel protocol, not the Realtime protocol. */
export const AUDITION_SCRIPT =
  "I have a complaint. About you, obviously. I haven't decided what you've done wrong yet, but I'm confident I'll find something. Have a lovely day.";
/** Server-owned hard deadline; fits the Workers post-response keep-alive window. */
export const AUDITION_LIMIT_MS = 30_000;
/**
 * A crashed supervisor leaves OpenAI's own 120 s transcript-inactivity close
 * as the backstop, so the lease and spend reservation assume that worst case.
 */
export const AUDITION_LEASE_MS = 150_000;
export const AUDITION_RESERVED_SECONDS = 150;
export const AUDITION_DEFAULT_DAILY = 10;
export const AUDITION_DEFAULT_MONTHLY_SECONDS = 3_000;
// Durable lease ledger (voice_studio_auditions), server sideband deadline and
// spend caps are installed; the env flag still has to be explicitly enabled.
export const AUDITION_SERVER_SAFEGUARDS_READY = true;

export function auditionLimits(env: Record<string, string | undefined>) {
  const num = (v: string | undefined, d: number, max: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? Math.min(n, max) : d;
  };
  return {
    daily: num(env["VOICE_AUDITION_DAILY_LIMIT"], AUDITION_DEFAULT_DAILY, 50),
    monthlySeconds: num(
      env["VOICE_AUDITION_MONTHLY_SECONDS"],
      AUDITION_DEFAULT_MONTHLY_SECONDS,
      20_000,
    ),
  };
}

export function reservationError(reason: unknown): string {
  if (reason === "active")
    return "An audition is already running. Stop it, or wait up to 2½ minutes if a tab was closed.";
  if (reason === "daily") return "Daily audition limit reached. Try again tomorrow.";
  if (reason === "monthly") return "Monthly audition spending cap reached.";
  return "Audition could not be reserved.";
}

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

/** RMS above this (0–1 float samples) counts as audible, non-silent speech. */
export const AUDIBLE_RMS = 0.01;
/** After speech transcript stops arriving this long, the single take is over. */
export const SPEECH_QUIET_MS = 2_500;

/** Developer prompt seeded at session creation so speech starts from frame one. */
export const AUDITION_SPEAK_PROMPT = `Speak now, in English, the following sample exactly once, word for word, then stay completely silent until the session ends: "${AUDITION_SCRIPT}"`;

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

export type AuditionTrace = { at: number; type: string; detail?: string | undefined };

/** No paid request is made until start is called explicitly by the UI. */
export function createStudioAudition(options: {
  audio: HTMLAudioElement;
  mode?: AuditionMode;
  conversationalOptions?: ConversationalOptions;
  connect: (sdp: string) => Promise<{ sdp: string }>;
  onState: (state: AuditionState) => void;
  onError: (message: string) => void;
  onLevel?: (level: number, audible: boolean) => void;
  onTranscript?: (text: string) => void;
  onTrace?: (event: AuditionTrace) => void;
  /** Decoded incoming audio, suitable for local MediaRecorder capture. */
  onRecordableStream?: (stream: MediaStream) => void;
}) {
  const pc = new RTCPeerConnection();
  const channel = pc.createDataChannel("oai-events");
  let state: AuditionState = "connecting";
  let requested = false;
  let limit: ReturnType<typeof setTimeout> | undefined;
  let drain: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let startup: ReturnType<typeof setTimeout> | undefined;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let transcript = "";
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let heardAudio = false;
  const t0 = Date.now();

  function trace(type: string, detail?: string) {
    options.onTrace?.({ at: Date.now() - t0, type, detail });
  }
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
      try {
        channel.send(JSON.stringify({ type: "session.close" }));
      } catch {
        /* transport lost */
      }
    }
    clearTimeout(limit);
    clearTimeout(drain);
    clearTimeout(startup);
    clearTimeout(quiet);
    clearInterval(poll);
    window.removeEventListener("pagehide", release);
    silence();
    void ctx?.close().catch(() => {});
    ctx = null;
    options.onLevel?.(0, false);
    update("closed");
    channel.close();
    pc.close();
  }
  function stop() {
    if (!active()) return;
    update("stopping");
    clearTimeout(limit);
    clearTimeout(startup);
    clearTimeout(quiet);
    clearInterval(poll);
    silence();
    options.onLevel?.(0, false);
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
      void ctx?.resume().catch(() => {});
    } catch {
      if (active()) update("blocked");
    }
  }
  const buf = new Float32Array(1024);
  function observe() {
    if (!active()) return;
    // Media-clock advance is not evidence of sound; measure actual energy.
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buf);
    const level = rms(buf);
    const audible = level >= AUDIBLE_RMS;
    options.onLevel?.(level, audible);
    if (audible && !heardAudio) {
      heardAudio = true;
      trace("audio.audible", level.toFixed(3));
    }
    if (audible && state !== "playing" && state !== "blocked") update("playing");
  }
  /** Silent outgoing track: GPT-Live expects an active input stream, no mic needed. */
  function silentInput(): MediaStreamTrack | null {
    if (!ctx) return null;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start();
    return dest.stream.getAudioTracks()[0] ?? null;
  }
  pc.ontrack = ({ track }) => {
    if (!active()) return;
    const stream = new MediaStream([track]);
    options.audio.srcObject = stream;
    trace("media.track", track.kind);
    if (ctx) {
      try {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        const src = ctx.createMediaStreamSource(stream);
        src.connect(analyser);
        // Chrome can record silence from a raw remote WebRTC track; route
        // through Web Audio so the recorder captures decoded, audible audio.
        const dest = ctx.createMediaStreamDestination();
        src.connect(dest);
        options.onRecordableStream?.(dest.stream);
      } catch {
        trace("meter.unavailable");
        options.onRecordableStream?.(stream);
      }
    } else {
      options.onRecordableStream?.(stream);
    }
    void resume();
  };
  pc.onconnectionstatechange = () => {
    trace("pc." + pc.connectionState);
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
      fail("Audition connection lost. Start a new audition to retry.");
    }
  };
  channel.onmessage = ({ data }) => {
    try {
      const event = JSON.parse(String(data)) as {
        type?: string;
        delta?: string;
        reason?: string;
        error?: { message?: string; code?: string };
      };
      const type = event.type ?? "unknown";
      if (type !== "session.output_transcript.delta" && type !== "session.usage.updated")
        trace(type, event.error?.message ?? event.reason);
      if (type === "session.closed") return release();
      if (!active()) return;
      if (type === "error")
        return fail(
          `OpenAI rejected the audition command: ${event.error?.message ?? "unknown error"}`,
        );
      if (type === "session.output_transcript.delta" && event.delta) {
        if (!transcript) trace("speech.started");
        transcript += event.delta;
        options.onTranscript?.(transcript);
        // One take only: close shortly after the model stops speaking.
        clearTimeout(quiet);
        quiet = setTimeout(() => {
          trace("speech.finished");
          stop();
        }, SPEECH_QUIET_MS);
      }
      if (type === "session.started" && !requested) {
        requested = true;
        clearTimeout(startup);
        update("ready");
        // Keep the client reinforcement aligned with the server's seeded mode.
        channel.send(
          JSON.stringify({
            type: "session.instructions.append",
            event_id: crypto.randomUUID(),
            delegation_id: null,
            content: auditionReinforcement(options.mode ?? "scripted", AUDITION_SPEAK_PROMPT, options.conversationalOptions),
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
    // Create audio graph and unlock playback while still in the click gesture.
    const AC =
      typeof window !== "undefined"
        ? (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (AC) {
      try {
        ctx = new AC();
        void ctx.resume().catch(() => {});
      } catch {
        ctx = null;
      }
    }
    const input = silentInput();
    if (input) pc.addTrack(input, new MediaStream([input]));
    else pc.addTransceiver("audio", { direction: "recvonly" });
    poll = setInterval(observe, 100);
    void options.audio.play().catch(() => {});
    try {
      await pc.setLocalDescription(await pc.createOffer());
      if (!active()) return;
      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error("Missing audition offer");
      const answer = await options.connect(sdp);
      if (!active()) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
      trace("sdp.answered");
    } catch (e) {
      fail(e instanceof Error ? e.message : "Audition failed");
    }
  }
  return { start, stop, release, resume };
}
