import { encodeWave, bytesBase64 } from "./phone-audio";
/** Owns all microphone/playback resources. Nothing starts during render or ringing. */
export class PhoneAudio {
  stream: MediaStream | null = null;
  context: AudioContext | null = null;
  recorder: MediaRecorder | null = null;
  audio: HTMLAudioElement | null = null;
  url: string | null = null;
  timer: ReturnType<typeof setInterval> | null = null;
  closed = false;
  muted = false;
  source: MediaStreamAudioSourceNode | null = null;
  async open() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
      throw new Error("This browser cannot make microphone calls");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    if (this.closed) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("Call ended");
    }
    this.stream = stream;
    this.context = new AudioContext();
    await this.context.resume();
  }
  setMuted(v: boolean) {
    this.muted = v;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !v));
    if (v) this.cancelRecording();
  }
  cancelRecording() {
    this.source?.disconnect();
    this.source = null;
    if (this.recorder) {
      this.recorder.onstop = null;
      if (this.recorder.state !== "inactive") this.recorder.stop();
      this.recorder = null;
    }
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  record(onClip: (data: string) => void, onSilence: () => void) {
    if (this.closed || this.muted || !this.stream || !this.context)
      throw new Error("Microphone unavailable");
    this.cancelRecording();
    const chunks: BlobPart[] = [],
      recorder = new MediaRecorder(this.stream);
    this.recorder = recorder;
    const ctx = this.context,
      source = ctx.createMediaStreamSource(this.stream),
      analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    this.source = source;
    const levels = new Uint8Array(analyser.fftSize);
    let heard = false,
      lastSpeech = Date.now();
    const started = Date.now();
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      source.disconnect();
      if (this.source === source) this.source = null;
      if (this.closed || this.muted || !heard) {
        onSilence();
        return;
      }
      void new Blob(chunks)
        .arrayBuffer()
        .then((b) => ctx.decodeAudioData(b))
        .then((buffer) => {
          if (this.closed) return;
          const mono = new Float32Array(buffer.length);
          for (let c = 0; c < buffer.numberOfChannels; c++) {
            const a = buffer.getChannelData(c);
            for (let i = 0; i < a.length; i++) mono[i]! += a[i]! / buffer.numberOfChannels;
          }
          onClip(bytesBase64(encodeWave(mono, buffer.sampleRate)));
        })
        .catch(() => {
          if (!this.closed) onSilence();
        });
    };
    recorder.start();
    this.timer = setInterval(() => {
      analyser.getByteTimeDomainData(levels);
      const rms = Math.sqrt(levels.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) / levels.length);
      if (rms > 0.025) {
        heard = true;
        lastSpeech = Date.now();
      }
      if (
        Date.now() - started >= 10000 ||
        (heard && Date.now() - lastSpeech > 850) ||
        (!heard && Date.now() - started > 7000)
      ) {
        if (recorder.state !== "inactive") recorder.stop();
      }
    }, 100);
  }
  stopRecording() {
    if (this.recorder?.state === "recording") this.recorder.stop();
  }
  stopPlayback() {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
  async play(base64: string, mime: string, ended: () => void) {
    this.stopPlayback();
    if (this.closed) throw new Error("Call ended");
    const b = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    this.url = URL.createObjectURL(new Blob([b], { type: mime }));
    this.audio = new Audio(this.url);
    this.audio.onended = ended;
    await this.audio.play();
  }
  async chooseOutput() {
    const a = this.audio as
      (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    const media = navigator.mediaDevices as MediaDevices & {
      selectAudioOutput?: () => Promise<MediaDeviceInfo>;
    };
    if (!a?.setSinkId || !media.selectAudioOutput)
      throw new Error("Use your phone’s volume and Bluetooth controls to choose audio output");
    const output = await media.selectAudioOutput();
    await a.setSinkId(output.deviceId);
  }
  close() {
    this.closed = true;
    this.cancelRecording();
    this.stopPlayback();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
