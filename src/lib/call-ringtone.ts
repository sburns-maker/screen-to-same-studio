/** Local in-app sound only. Never opens the microphone or contacts a provider. */
let context: AudioContext | undefined;
const key = "ai-town:call-ringtone";
export function ringtoneEnabled() {
  try {
    return localStorage.getItem(key) === "on";
  } catch {
    return false;
  }
}
export async function enableRingtone() {
  context ??= new AudioContext();
  await context.resume();
  if (context.state !== "running") throw new Error("Sound is blocked");
  localStorage.setItem(key, "on");
  window.dispatchEvent(new Event("call-ringtone-change"));
}
export function disableRingtone() {
  localStorage.setItem(key, "off");
  window.dispatchEvent(new Event("call-ringtone-change"));
}
export async function startRingtone(until: string): Promise<() => void> {
  if (!Number.isFinite(Date.parse(until)) || Date.parse(until) <= Date.now()) return () => {};
  if (!ringtoneEnabled()) throw new Error("Sound is off");
  context ??= new AudioContext();
  // Don't await a suspended context: some mobile browsers leave resume pending.
  void context.resume().catch(() => {});
  if (context.state !== "running") throw new Error("Tap to enable ringing");
  const audio = context;
  const voices = new Set<OscillatorNode>();
  let stopped = false;
  const pulse = () => {
    if (stopped || Date.now() >= Date.parse(until)) return;
    for (const offset of [0, 0.45]) {
      const oscillator = audio.createOscillator(),
        gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = offset === 0 ? 740 : 880;
      gain.gain.setValueAtTime(0, audio.currentTime + offset);
      gain.gain.linearRampToValueAtTime(0.33, audio.currentTime + offset + 0.02);
      gain.gain.linearRampToValueAtTime(0, audio.currentTime + offset + 0.3);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      voices.add(oscillator);
      oscillator.onended = () => {
        voices.delete(oscillator);
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(audio.currentTime + offset);
      oscillator.stop(audio.currentTime + offset + 0.32);
    }
  };
  const stop = () => {
    stopped = true;
    clearInterval(interval);
    clearTimeout(deadline);
    for (const voice of voices) {
      try {
        voice.stop();
      } catch {
        /* already ended */
      }
    }
    voices.clear();
  };
  const interval = setInterval(pulse, 1900);
  const deadline = setTimeout(stop, Math.max(0, Date.parse(until) - Date.now()));
  pulse();
  return stop;
}
