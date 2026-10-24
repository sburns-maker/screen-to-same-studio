import { DELEGATION_REPLY, type TranscriptLine } from "./live-calls";

export type LiveCallState = "dialing" | "connected" | "blocked" | "ending" | "ended";

/** Browser side of a live character call. No paid request until start(). */
export function createLiveCall(options: {
  audio: HTMLAudioElement;
  connect: (sdp: string) => Promise<{ sdp: string } | null>;
  onState: (s: LiveCallState) => void;
  onError: (m: string) => void;
  onTranscript: (lines: TranscriptLine[]) => void;
  onSpeaking?: (speaking: boolean) => void;
}) {
  const pc = new RTCPeerConnection();
  const channel = pc.createDataChannel("oai-events");
  let state: LiveCallState = "dialing";
  let mic: MediaStream | null = null;
  let drain: ReturnType<typeof setTimeout> | undefined;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  const lines: TranscriptLine[] = [];
  const answered = new Set<string>();

  const set = (s: LiveCallState) => {
    state = s;
    options.onState(s);
  };
  const live = () => state !== "ending" && state !== "ended";
  function push(role: TranscriptLine["role"], delta: string) {
    const last = lines[lines.length - 1];
    if (last && last.role === role) last.text += delta;
    else lines.push({ role, text: delta });
    options.onTranscript(lines.map((l) => ({ ...l })));
  }
  function release() {
    if (state === "ended") return;
    clearTimeout(drain);
    clearTimeout(quiet);
    window.removeEventListener("pagehide", release);
    options.audio.pause();
    options.audio.srcObject = null;
    mic?.getTracks().forEach((t) => t.stop());
    mic = null;
    set("ended");
    try {
      channel.close();
      pc.close();
    } catch {
      /* already closed */
    }
  }
  function hangUp() {
    if (!live()) return;
    set("ending");
    options.audio.pause();
    mic?.getTracks().forEach((t) => t.stop());
    if (channel.readyState !== "open") return release();
    try {
      channel.send(JSON.stringify({ type: "session.close" }));
    } catch {
      return release();
    }
    drain = setTimeout(release, 5_000);
  }
  function send(event: Record<string, unknown>) {
    if (channel.readyState === "open") channel.send(JSON.stringify(event));
  }
  pc.ontrack = ({ track }) => {
    if (!live()) return;
    options.audio.srcObject = new MediaStream([track]);
    void options.audio.play().catch(() => live() && set("blocked"));
  };
  pc.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(pc.connectionState) && live()) {
      options.onError("The call dropped.");
      hangUp();
    }
  };
  channel.onopen = () => live() && set("connected");
  channel.onmessage = ({ data }) => {
    let ev: {
      type?: string;
      delta?: string;
      text?: string;
      error?: { message?: string };
      delegation?: { id?: string; target?: string };
    };
    try {
      ev = JSON.parse(String(data));
    } catch {
      return;
    }
    const type = ev.type ?? "";
    if (type === "session.closed") return release();
    if (!live()) return;
    if (type === "error") {
      options.onError(ev.error?.message ?? "The call hit an error.");
      return hangUp();
    }
    if (type === "session.output_transcript.delta" && ev.delta) {
      push("character", ev.delta);
      options.onSpeaking?.(true);
      clearTimeout(quiet);
      quiet = setTimeout(() => options.onSpeaking?.(false), 1_200);
    } else if (type.includes("input_transcript") && (ev.delta || ev.text)) {
      push("user", ev.delta ?? ev.text ?? "");
    }
    if (type === "session.delegation.created" && ev.delegation?.target === "client" && ev.delegation.id) {
      if (answered.has(ev.delegation.id)) return;
      answered.add(ev.delegation.id);
      send({
        type: "session.commentary.append",
        event_id: crypto.randomUUID(),
        delegation_id: ev.delegation.id,
        content: DELEGATION_REPLY,
      });
    }
  };
  channel.onclose = () => release();
  window.addEventListener("pagehide", release);

  async function start() {
    set("dialing");
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      options.onError("Microphone permission is needed to call.");
      return release();
    }
    void options.audio.play().catch(() => {});
    for (const t of mic.getAudioTracks()) pc.addTrack(t, mic);
    try {
      await pc.setLocalDescription(await pc.createOffer());
      const sdp = pc.localDescription?.sdp;
      if (!sdp || !live()) return release();
      const answer = await options.connect(sdp);
      if (!answer) return release();
      if (!live()) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    } catch (e) {
      options.onError(e instanceof Error ? e.message : "The call didn't connect.");
      release();
    }
  }
  return {
    start,
    hangUp,
    release,
    transcript: () => lines.map((l) => ({ ...l })),
    setMuted: (m: boolean) => mic?.getAudioTracks().forEach((t) => (t.enabled = !m)),
    resume: () => options.audio.play().then(() => live() && set("connected")).catch(() => {}),
  };
}
