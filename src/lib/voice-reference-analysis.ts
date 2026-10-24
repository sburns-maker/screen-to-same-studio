/**
 * Pure acoustic analysis of a short reference clip (mono PCM floats) and a
 * deterministic builder that turns measurements + listening notes into
 * GPT-Live performance instructions. No network, no storage.
 */
export const REFERENCE_MAX_SECONDS = 60;
export const REFERENCE_MAX_BYTES = 3_000_000;

export type ReferenceStats = {
  durationSec: number;
  medianPitchHz: number | null;
  pitchLowHz: number | null;
  pitchHighHz: number | null;
  wordsPerMinute: number | null;
  pauseRatio: number;
};

export function analyzePcm(input: Float32Array, sampleRate: number, transcript = ""): ReferenceStats {
  const samples = Array.from(input);
  const durationSec = samples.length / sampleRate;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  const frame = Math.floor(sampleRate * 0.04);
  const hop = Math.floor(sampleRate * 0.01);
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.floor(sampleRate / 80);
  const f0s: number[] = [];
  let frames = 0;
  let quiet = 0;
  for (let start = 0; start + frame + maxLag < samples.length; start += hop) {
    frames++;
    let e = 0;
    for (let i = 0; i < frame; i++) e += samples[start + i]! ** 2;
    if (Math.sqrt(e / frame) < rms * 0.2) {
      quiet++;
      continue;
    }
    const corr: number[] = [];
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let c = 0;
      for (let i = 0; i < frame; i++) c += samples[start + i]! * samples[start + i + lag]!;
      corr.push(c);
      if (c > best) best = c;
    }
    // First lag near the maximum avoids octave (sub-harmonic) errors.
    const idx = corr.findIndex((c, i) => c >= 0.9 * best && (i === 0 || c >= corr[i - 1]!) && (i + 1 >= corr.length || c >= corr[i + 1]!));
    const bestLag = idx >= 0 ? minLag + idx : 0;
    if (bestLag && best > 0.4 * e) f0s.push(sampleRate / bestLag);
  }
  f0s.sort((a, b) => a - b);
  const pct = (p: number) => (f0s.length ? Math.round(f0s[Math.min(f0s.length - 1, Math.floor(p * f0s.length))]!) : null);
  const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  return {
    durationSec: Math.round(durationSec * 10) / 10,
    medianPitchHz: pct(0.5),
    pitchLowHz: pct(0.1),
    pitchHighHz: pct(0.9),
    wordsPerMinute: words && durationSec > 1 ? Math.round((words / durationSec) * 60) : null,
    pauseRatio: frames ? Math.round((quiet / frames) * 100) / 100 : 0,
  };
}

export function paceWords(wpm: number | null) {
  if (wpm == null) return null;
  if (wpm < 110) return "unhurried and deliberate";
  if (wpm < 140) return "relaxed and conversational";
  if (wpm < 170) return "lively";
  return "quick";
}

export function registerWords(hz: number | null) {
  if (hz == null) return null;
  if (hz < 170) return "low, warm";
  if (hz < 210) return "mid, grounded";
  if (hz < 250) return "natural, moderately light";
  return "bright, light";
}

/** Builds instructions that keep the character identity and add measured delivery targets. */
export function buildMatchedInstructions(base: string, stats: ReferenceStats, listeningNotes: string) {
  const lines: string[] = [];
  const pace = paceWords(stats.wordsPerMinute);
  const reg = registerWords(stats.medianPitchHz);
  if (pace && stats.wordsPerMinute) lines.push(`Pace: ${pace}, around ${stats.wordsPerMinute} words per minute. Do not rush.`);
  if (reg && stats.medianPitchHz)
    lines.push(`Pitch: ${reg} register centred near ${stats.medianPitchHz} Hz, moving naturally between about ${stats.pitchLowHz} and ${stats.pitchHighHz} Hz; neither deep nor squeaky.`);
  if (stats.pauseRatio >= 0.3) lines.push("Leave relaxed, natural pauses between thoughts.");
  const notes = listeningNotes.trim();
  return [base.trim(), "Match this reference delivery:", ...lines, notes].filter(Boolean).join("\n\n").slice(0, 4000);
}
