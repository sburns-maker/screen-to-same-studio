/** Canonical PCM WAV is bounded and validated server-side; client duration claims are never trusted. */
export function encodeWave(samples: Float32Array, sampleRate: number): Uint8Array {
  const length = Math.min(160000, Math.floor((samples.length * 16000) / sampleRate)),
    out = new Uint8Array(44 + length * 2),
    d = new DataView(out.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) d.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  d.setUint32(4, out.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true);
  d.setUint16(22, 1, true);
  d.setUint32(24, 16000, true);
  d.setUint32(28, 32000, true);
  d.setUint16(32, 2, true);
  d.setUint16(34, 16, true);
  text(36, "data");
  d.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const p = (i * sampleRate) / 16000,
      at = Math.floor(p),
      v = (samples[at] ?? 0) * (1 - (p - at)) + (samples[at + 1] ?? 0) * (p - at);
    d.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true);
  }
  return out;
}
export function waveSeconds(bytes: Uint8Array) {
  if (bytes.length < 644 || bytes.length > 320044) throw new Error("Speak for up to ten seconds");
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    word = (p: number, n: number) => String.fromCharCode(...bytes.slice(p, p + n));
  if (
    word(0, 4) !== "RIFF" ||
    word(8, 4) !== "WAVE" ||
    word(12, 4) !== "fmt " ||
    word(36, 4) !== "data" ||
    d.getUint32(4, true) !== bytes.length - 8 ||
    d.getUint32(16, true) !== 16 ||
    d.getUint16(20, true) !== 1 ||
    d.getUint16(22, true) !== 1 ||
    d.getUint32(24, true) !== 16000 ||
    d.getUint32(28, true) !== 32000 ||
    d.getUint16(32, true) !== 2 ||
    d.getUint16(34, true) !== 16 ||
    d.getUint32(40, true) !== bytes.length - 44 ||
    (bytes.length - 44) % 2
  )
    throw new Error("Unsupported call audio format");
  let peak = 0;
  for (let i = 44; i < bytes.length; i += 2) peak = Math.max(peak, Math.abs(d.getInt16(i, true)));
  if (peak < 32) throw new Error("No speech audio detected");
  return (bytes.length - 44) / 32000;
}
export function bytesBase64(b: Uint8Array) {
  let s = "";
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return btoa(s);
}
