import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { analyzeVoiceReference } from "@/lib/live-voice-design.functions";
import {
  REFERENCE_MAX_SECONDS,
  analyzePcm,
  buildMatchedInstructions,
  type ReferenceStats,
} from "@/lib/voice-reference-analysis";
import { CUE_MAX, PERFORMANCE_MAX, TESS_CONVERSATIONAL_DIRECTION, type ConversationalOptions } from "@/lib/voice-audition-modes";

function encodeWav(samples: Float32Array, rate: number) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i] ?? 0)) * 0x7fff, true);
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function VoiceReferenceMatcher({ disabled, onApply }: { disabled: boolean; onApply: (o: ConversationalOptions) => void }) {
  const analyze = useServerFn(analyzeVoiceReference);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ stats: ReferenceStats; transcript: string; notes: string } | null>(null);

  async function handle(file: File) {
    setError(""); setResult(null); setBusy(true);
    try {
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
      void ctx.close();
      if (decoded.duration > REFERENCE_MAX_SECONDS) throw new Error(`Use a clip of ${REFERENCE_MAX_SECONDS} seconds or less.`);
      const rate = 24000;
      const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
      const src = off.createBufferSource();
      src.buffer = decoded; src.connect(off.destination); src.start();
      const mono = (await off.startRendering()).getChannelData(0);
      const { transcript, notes } = await analyze({ data: { wavBase64: encodeWav(mono, rate) } });
      setResult({ stats: analyzePcm(mono, rate, transcript), transcript, notes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That clip could not be analysed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-background p-3 text-sm">
      <p className="font-medium">Match a reference clip</p>
      <p className="mt-1 text-muted-foreground">Upload a short voice clip. It's listened to once for tone, pace and pitch, then turned into editable instructions. The clip isn't saved and no new voice is created.</p>
      <input type="file" accept="audio/*" className="mt-2 block w-full text-sm" disabled={disabled || busy}
        aria-label="Reference voice clip"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ""; }} />
      {busy && <p className="mt-2 text-muted-foreground">Listening to the clip…</p>}
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
      {result && (
        <div className="mt-3 space-y-2">
          <p>Pace: {result.stats.wordsPerMinute ?? "?"} wpm · Pitch ≈ {result.stats.medianPitchHz ?? "?"} Hz ({result.stats.pitchLowHz}–{result.stats.pitchHighHz}) · {result.stats.durationSec}s</p>
          {result.transcript && <p className="italic">“{result.transcript}”</p>}
          {result.notes ? <pre className="whitespace-pre-wrap break-words text-xs">{result.notes}</pre>
            : <p className="text-muted-foreground">Tone notes weren't available; pace and pitch will still be used.</p>}
          <Button type="button" disabled={disabled} onClick={() => onApply({
            performanceInstructions: buildMatchedInstructions(TESS_CONVERSATIONAL_DIRECTION, result.stats, result.notes).slice(0, PERFORMANCE_MAX),
            conversationalCue: (result.transcript || "How was your day?").slice(0, CUE_MAX),
          })}>Use these instructions</Button>
        </div>
      )}
    </div>
  );
}
