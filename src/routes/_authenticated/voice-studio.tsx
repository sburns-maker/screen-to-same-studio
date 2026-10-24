import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Square } from "lucide-react";
import { SCRIPT_MAX, SCRIPT_DRAFT_STORE, scriptedSpeakPrompt, CHARACTER_VOICE_PRESETS, CONVERSATIONAL_DRAFT_STORE, DEFAULT_CONVERSATIONAL_OPTIONS, CONVERSATIONAL_CUE, PERFORMANCE_MAX, CUE_MAX, conversationalOptionsSchema, restoreConversationalDraft, auditionSessionConfig, auditionReinforcement, type ConversationalOptions, type AuditionMode } from "@/lib/voice-audition-modes";
import {
  AUDITION_SCRIPT,
  AUDITION_SPEAK_PROMPT,
  createStudioAudition,
  type AuditionState,
  type AuditionTrace,
} from "@/lib/voice-studio-audition";
import {
  deleteSample,
  loadSample,
  sampleFilename,
  sampleVerdict,
  saveSample,
  startSampleRecording,
  type StoredSample,
} from "@/lib/voice-sample-recorder";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { VoiceReferenceMatcher } from "@/components/VoiceReferenceMatcher";
import { characterVoices, setCharacterVoice } from "@/lib/live-calls.functions";
import {
  VOICE_DESIGNS,
  VOICE_NAME_MAX,
  VOICE_PRESETS,
  VOICE_PROMPT_MAX,
  defaultVoiceName,
  presetVoicePrompt,
  validateVoiceRequest,
  type VoiceDesignKey,
  type VoiceVariant,
} from "@/lib/live-voice-design";
import {
  createCharacterVoiceCandidate,
  voiceStudioStatus,
  startVoiceStudioAudition,
  stopVoiceStudioAudition,
} from "@/lib/live-voice-design.functions";

export const Route = createFileRoute("/_authenticated/voice-studio")({
  head: () => ({
    meta: [
      { title: "Voice Studio · Developer" },
      {
        name: "description",
        content: "Developer tool to create and audition fictional character voice candidates.",
      },
      { property: "og:title", content: "Voice Studio · Developer" },
      {
        property: "og:description",
        content: "Create and audition fictional character voice candidates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VoiceStudio,
});

type Variant = VoiceVariant;
type Candidate = { id: string; variant: Variant; character: VoiceDesignKey; approved: false; name?: string };
type Draft = { prompt: string; name: string };
const variants: Variant[] = VOICE_PRESETS;
const DRAFT_STORE = "voice-studio-drafts-v1";
function presetDraft(c: VoiceDesignKey, v: Variant): Draft {
  return {
    prompt: v === "custom" ? "" : presetVoicePrompt(c, v),
    name: defaultVoiceName(c, v),
  };
}
const characters = Object.keys(VOICE_DESIGNS) as VoiceDesignKey[];
const STORE = "voice-studio-candidates-v1";
const title = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

function Step({ n, title: t, children, anchor }: { n: number; title: string; children: React.ReactNode; anchor?: string }) {
  return (
    <section id={anchor} className="scroll-mt-24 rounded-2xl bg-surface p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
          {n}
        </span>
        {t}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function VoiceStudio() {
  const create = useServerFn(createCharacterVoiceCandidate);
  const statusFn = useServerFn(voiceStudioStatus);
  const auditionFn = useServerFn(startVoiceStudioAudition);
  const stopFn = useServerFn(stopVoiceStudioAudition);
  const player = useRef<ReturnType<typeof createStudioAudition> | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [auditionState, setAuditionState] = useState<AuditionState | "idle">("idle");
  const playing = !["idle", "closed"].includes(auditionState);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof voiceStudioStatus>> | null>(null);
  const [error, setError] = useState("");
  const [character, setCharacter] = useState<VoiceDesignKey>("tess");
  const [busy, setBusy] = useState<Variant | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState("");
  const voicesFn = useServerFn(characterVoices);
  const setVoiceFn = useServerFn(setCharacterVoice);
  const [voices, setVoices] = useState<{ character_key: string; voice_id: string; label: string }[]>([]);
  const [settingVoice, setSettingVoice] = useState(false);
  const [auditionMode, setAuditionMode] = useState<AuditionMode>("scripted");
  const [conversationalOptions, setConversationalOptions] = useState<ConversationalOptions>(DEFAULT_CONVERSATIONAL_OPTIONS);
  const [script, setScript] = useState(AUDITION_SCRIPT);
  const scriptInvalid = !script.trim() ? "Enter a script." : script.length > SCRIPT_MAX ? `Script must be at most ${SCRIPT_MAX} characters.` : undefined;
  function saveScript(v: string) {
    setScript(v);
    try { localStorage.setItem(SCRIPT_DRAFT_STORE, v); } catch { /* ignore */ }
  }
  const conversationalValidation = conversationalOptionsSchema.safeParse(conversationalOptions);
  const auditionInvalid = auditionMode === "conversational" && !conversationalValidation.success
    ? conversationalValidation.error.issues[0]?.message : auditionMode === "scripted" ? scriptInvalid : undefined;
  const [copied, setCopied] = useState("");
  const [level, setLevel] = useState(0);
  const [spoken, setSpoken] = useState("");
  const [trace, setTrace] = useState<AuditionTrace[]>([]);
  const [variant, setVariant] = useState<Variant>("natural");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftKey = `${character}:${variant}`;
  const draft: Draft = drafts[draftKey] ?? presetDraft(character, variant);
  const invalid = validateVoiceRequest(draft.prompt, draft.name);
  const [sample, setSample] = useState<StoredSample | null>(null);
  const [sampleUrl, setSampleUrl] = useState("");
  const [sampleNote, setSampleNote] = useState("");
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    try {
      const savedScript = localStorage.getItem(SCRIPT_DRAFT_STORE);
      if (savedScript && savedScript.trim() && savedScript.length <= SCRIPT_MAX) setScript(savedScript);
      setConversationalOptions(restoreConversationalDraft(localStorage.getItem(CONVERSATIONAL_DRAFT_STORE)));
      const raw = localStorage.getItem(DRAFT_STORE);
      if (raw) setDrafts(JSON.parse(raw) as Record<string, Draft>);
    } catch {
      /* ignore */
    }
    void loadSample()
      .then((s) => s && setSample(s))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!sample) return setSampleUrl("");
    const url = URL.createObjectURL(sample.blob);
    setSampleUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sample]);

  function saveDrafts(next: Record<string, Draft>) {
    setDrafts(next);
    try {
      localStorage.setItem(DRAFT_STORE, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  function saveConversationalOptions(next: ConversationalOptions) {
    setConversationalOptions(next);
    try {
      localStorage.setItem(CONVERSATIONAL_DRAFT_STORE, JSON.stringify(next));
    } catch {
      setError("Audition edits could not be saved on this device; they remain available for this visit.");
    }
  }
  function updateDraft(patch: Partial<Draft>) {
    saveDrafts({ ...drafts, [draftKey]: { ...draft, ...patch } });
  }
  function resetDraft() {
    const next = { ...drafts };
    delete next[draftKey];
    saveDrafts(next);
  }
  function pickVariant(v: Variant) {
    setVariant(v);
  }


  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) setCandidates(JSON.parse(raw) as Candidate[]);
    } catch {
      /* ignore */
    }
    let active = true;
    void voicesFn()
      .then((v) => active && setVoices(v.voices))
      .catch(() => {});
    void statusFn()
      .then((v) => {
        if (active) setStatus(v);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [statusFn]);

  function save(next: Candidate[]) {
    setCandidates(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setError("Copy failed — long-press the ID to copy it manually.");
    }
  }

  async function generate() {
    if (invalid) return setError(invalid);
    if (
      !window.confirm(
        `Create "${draft.name.trim()}" as a new paid voice at OpenAI? This is billed and adds a voice to your account. It will not be approved or activated automatically.`,
      )
    )
      return;
    setBusy(variant);
    setError("");
    try {
      const v = await create({
        data: {
          character,
          variant,
          prompt: draft.prompt,
          name: draft.name,
          confirmation: "CREATE CUSTOM VOICE",
        },
      });
      save([...candidates, { ...v, character, variant, name: draft.name.trim() }]);
      setSelected(v.id);
    } catch (e) {
      setError(`${(e as Error).message} Your saved candidates are unchanged.`);
    } finally {
      setBusy(null);
    }
  }

  function refineSelectedCandidate() {
    const candidate = candidates.find((c) => c.id === selected && c.character === character);
    if (!candidate) return;
    const key = `${character}:custom`;
    const prompt = candidate.variant === "custom" ? (drafts[key]?.prompt ?? "") : presetVoicePrompt(character, candidate.variant);
    saveDrafts({ ...drafts, [key]: { name: `${(candidate.name ?? "voice").slice(0, 43)} revised`, prompt } });
    setVariant("custom");
    document.getElementById("voice-create")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function stopAudition() {
    player.current?.stop();
  }
  useEffect(
    () => () => {
      player.current?.release();
    },
    [],
  );
  function audition() {
    if (player.current || !selected || !status?.auditionsEnabled || !audioRef.current) return;
    if (auditionInvalid) return setError(auditionInvalid);
    const auditionOptions = auditionMode === "conversational" ? { ...conversationalOptions } : { ...DEFAULT_CONVERSATIONAL_OPTIONS };
    if (
      !window.confirm(
        `Start a paid ${auditionMode} audition with the selected saved voice, limited to 30 seconds? No new voice is generated. It won't affect character memories or calls.`,
      )
    )
      return;
    setError("");
    setSpoken("");
    setTrace([]);
    setLevel(0);
    let auditionId: string | null = null;
    let recorder: ReturnType<typeof startSampleRecording> | null = null;
    let heard = false;
    const cand = candidates.find((c) => c.id === selected);
    const meta = {
      character,
      candidate: `${cand?.name ?? `${title(character)} ${cand?.variant ?? "voice"}`} · ${auditionMode}`,
      voiceId: selected,
    };
    let endedCleanly = false;
    const finishRecording = () => {
      const r = recorder;
      recorder = null;
      if (!r) return;
      r.stop();
      setRecording(false);
      void r.done.then(async ({ blob, mime, durationMs, failed }) => {
        const verdict = sampleVerdict({ size: blob.size, audible: heard });
        if (verdict === "empty") return setSampleNote("Recording captured no audio.");
        const s: StoredSample = {
          ...meta,
          blob,
          mime,
          durationMs,
          audible: heard,
          partial: failed || !endedCleanly,
          recordedAt: new Date().toISOString(),
        };
        setSample(s);
        setSampleNote(
          verdict === "silent"
            ? "Recording saved, but no audible speech was detected — it's probably silent."
            : "",
        );
        try {
          await saveSample(s);
        } catch {
          setSampleNote("Recording kept for this visit only; this device's storage refused it.");
        }
      });
    };
    const release = () => {
      if (!auditionId) return;
      const id = auditionId;
      auditionId = null;
      // Server-side close + lease release; the server deadline still applies if this fails.
      void stopFn({ data: { auditionId: id } }).catch(() => {});
    };
    const session = createStudioAudition({
      audio: audioRef.current,
      mode: auditionMode,
      conversationalOptions: auditionOptions,
      scriptedPrompt: auditionMode === "scripted" ? scriptedSpeakPrompt(script) : undefined,
      connect: async (sdp) => {
        const r = await auditionFn({
          data: { character, voiceId: selected, sdp, mode: auditionMode, ...auditionOptions, ...(auditionMode === "scripted" ? { script: script.trim() } : {}), confirmation: "START PAID VOICE AUDITION" },
        });
        auditionId = r.auditionId;
        return r;
      },
      onState: (state) => {
        setAuditionState(state);
        if (state === "stopping" || state === "closed") finishRecording();
        if (state === "closed") {
          player.current = null;
          release();
        }
      },
      onError: (m) => {
        endedCleanly = false;
        setError(m);
      },
      onLevel: (l, audible) => {
        setLevel(l);
        if (audible && recorder) heard = true;
      },
      onTranscript: (t) => {
        endedCleanly = true;
        setSpoken(t);
      },
      onTrace: (t) => setTrace((prev) => [...prev.slice(-29), t]),
      onRecordableStream: (stream) => {
        if (recorder || typeof MediaRecorder === "undefined") {
          if (!recorder) setSampleNote("This browser can't record samples.");
          return;
        }
        try {
          recorder = startSampleRecording(stream);
          setRecording(true);
          setSampleNote("");
        } catch (e) {
          setSampleNote((e as Error).message);
        }
      },
    });
    player.current = session;
    void session.start();
  }

  async function removeSample() {
    if (!window.confirm("Delete the saved sample from this device?")) return;
    setSample(null);
    setSampleNote("");
    await deleteSample().catch(() => {});
  }
  function sampleFile(s: StoredSample) {
    return new File([s.blob], sampleFilename(s.character, s.candidate, new Date(s.recordedAt), s.mime), {
      type: s.mime.split(";")[0] ?? s.mime,
    });
  }
  function downloadSample(s: StoredSample) {
    const f = sampleFile(s);
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  async function shareSample(s: StoredSample) {
    const f = sampleFile(s);
    if (navigator.canShare?.({ files: [f] })) {
      try {
        await navigator.share({ files: [f], title: f.name });
        return;
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return;
      }
    }
    downloadSample(s);
  }
  const current = candidates.filter((c) => c.character === character);
  const activeVoice = voices.find((v) => v.character_key === character) ?? null;
  async function useForCalls() {
    const cand = candidates.find((c) => c.id === selected && c.character === character);
    if (!cand) return;
    setSettingVoice(true);
    try {
      await setVoiceFn({
        data: { character, voiceId: cand.id, label: (cand.name || `${title(character)} — ${cand.variant}`).slice(0, 80) },
      });
      const v = await voicesFn();
      setVoices(v.voices);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSettingVoice(false);
    }
  }
  const canCreate =
    !!status?.creationEnabled && !!status.apiConfigured && busy === null && !playing;

  return (
    <>
      <ScreenHeader title="Voice Studio" backTo="/calls" />
      <Screen>
        <div className="space-y-4 pb-10">
          <nav aria-label="Voice Studio shortcuts" className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto border-b bg-background px-4 py-3">
            {([["voice-saved", "My voices"], ["voice-listen", "Listen"], ["voice-create", "Edit & create"]] as const).map(([id, label]) => (
              <a key={id} href={`#${id}`} className="shrink-0 rounded-full border bg-surface px-4 py-2 text-sm font-medium">{label}</a>
            ))}
          </nav>
          <section className="rounded-2xl bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Developer studio
            </p>
            <h1 className="mt-1 font-display text-2xl">Find their voice</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Edit descriptions and replay saved recordings for free. Creating a new voice or starting a live audition uses paid OpenAI services. Auditions are not character calls.
            </p>
            {status ? (
              <ul className="mt-3 space-y-1 text-sm">
                <li>
                  OpenAI key: <strong>{status.apiConfigured ? "Configured" : "Missing"}</strong>
                </li>
                <li>
                  Voice creation: <strong>{status.creationEnabled ? "Enabled" : "Disabled"}</strong>
                </li>
                <li>
                  Live calls: <strong>{status.liveEnabled ? "Enabled" : "Off"}</strong>
                </li>
              </ul>
            ) : !error ? (
              <p className="mt-3 text-sm">Checking developer access…</p>
            ) : null}
            {error && (
              <p role="alert" className="mt-3 rounded-lg border border-destructive p-2 text-sm">
                {error}
              </p>
            )}
          </section>

          <label className="block text-sm font-medium">
            Character
            <select
              aria-label="Voice character"
              className="mt-1 min-h-12 w-full rounded-xl border bg-surface px-3"
              value={character}
              disabled={playing || busy !== null}
              onChange={(e) => {
                setCharacter(e.target.value as VoiceDesignKey);
                setSelected("");
                setAuditionMode("scripted");
              }}
            >
              {characters.map((c) => (
                <option value={c} key={c}>
                  {title(c)}
                </option>
              ))}
            </select>
          </label>

          <section className="rounded-2xl bg-surface p-4">
            <h2 className="font-semibold">{VOICE_DESIGNS[character].name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {VOICE_DESIGNS[character].description}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Phone voice:{" "}
              {activeVoice
                ? `${activeVoice.label || "Unnamed voice"} (${activeVoice.voice_id.slice(0, 12)}…)`
                : status?.approved[character]
                  ? "Set on the server"
                  : "None yet"}
            </p>
          </section>

          <Step n={1} title="Edit description & create new voice" anchor="voice-create">
            <p className="text-xs text-muted-foreground">
              Free: revise this description as often as you like; drafts save on this phone. Paid: create a new voice only when ready. Existing OpenAI voice IDs are not editable in place.
            </p>
            {CHARACTER_VOICE_PRESETS[character] && (
              <Button
                type="button"
                className="mt-3 min-h-12 w-full"
                disabled={busy !== null}
                onClick={() => {
                  setVariant("custom");
                  saveDrafts({ ...drafts, [`${character}:custom`]: { ...CHARACTER_VOICE_PRESETS[character]! } });
                }}
              >
                {CHARACTER_VOICE_PRESETS[character]!.name.split(" — ")[0]} voice (fill everything in)
              </Button>
            )}
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[...variants, "custom" as const].map((v) => (
                <button
                  type="button"
                  key={v}
                  aria-pressed={variant === v}
                  disabled={busy !== null}
                  onClick={() => pickVariant(v)}
                  className={`min-h-11 rounded-xl border px-1 text-sm capitalize ${variant === v ? "border-primary bg-primary text-primary-foreground" : ""}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-sm font-medium">
              Candidate name
              <input
                className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm"
                value={draft.name}
                maxLength={VOICE_NAME_MAX}
                disabled={busy !== null}
                onChange={(e) => updateDraft({ name: e.target.value })}
              />
            </label>
            <label className="mt-3 block text-sm font-medium">
              Voice description (exact prompt sent to OpenAI)
              <textarea
                className="mt-1 min-h-48 w-full rounded-xl border bg-background p-3 text-sm"
                value={draft.prompt}
                maxLength={VOICE_PROMPT_MAX}
                disabled={busy !== null}
                onChange={(e) => updateDraft({ prompt: e.target.value })}
              />
            </label>
            <p className={`text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}>
              {draft.prompt.trim().length}/{VOICE_PROMPT_MAX} characters
              {invalid ? ` — ${invalid}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {variant !== "custom" && (
                <button
                  type="button"
                  className="min-h-11 rounded-lg border px-3 text-sm"
                  disabled={busy !== null}
                  onClick={resetDraft}
                >
                  Reset to preset
                </button>
              )}
              <Button
                type="button"
                className="min-h-11"
                disabled={!canCreate || !!invalid}
                onClick={() => void generate()}
              >
                {busy ? "Creating…" : "Create voice (paid)"}
              </Button>
            </div>
          </Step>

          <Step n={2} title="Hear the selected voice" anchor="voice-listen">
            <div role="group" aria-label="Audition mode" className="grid grid-cols-2 gap-2">
              {(["scripted", "conversational"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant={auditionMode === mode ? "default" : "outline"}
                  aria-pressed={auditionMode === mode}
                  disabled={playing || busy !== null || !status || (mode === "conversational" && character !== "tess")}
                  className="min-h-12 whitespace-normal px-2 text-sm"
                  onClick={() => setAuditionMode(mode)}
                >
                  {mode === "scripted" ? "Scripted audition" : "Conversational audition"}
                </Button>
              ))}
            </div>
            {auditionMode === "scripted" ? (
              <div className="mt-3 space-y-2">
                <label className="block text-sm font-medium">
                  Script (spoken word for word)
                  <textarea
                    className="mt-1 min-h-28 w-full rounded-lg border bg-background p-3 text-sm"
                    value={script}
                    aria-label="Audition script"
                    maxLength={SCRIPT_MAX}
                    disabled={playing || busy !== null}
                    onChange={(e) => saveScript(e.target.value)}
                  />
                </label>
                <p className="text-xs text-muted-foreground">{script.trim().length}/{SCRIPT_MAX} characters</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={playing || busy !== null} onClick={() => saveScript(AUDITION_SCRIPT)}>Reset script</Button>
                  <Button type="button" variant="outline" disabled={playing || busy !== null} onClick={() => saveScript(CONVERSATIONAL_CUE)}>Use reference line</Button>
                </div>
                {auditionInvalid && <p role="alert" className="text-sm text-destructive">{auditionInvalid}</p>}
                <VoiceReferenceMatcher disabled={playing || busy !== null || !status} onApply={(o) => { saveConversationalOptions(o); saveScript(o.conversationalCue.slice(0, SCRIPT_MAX)); }} />
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <label className="block text-sm font-medium">
                  Performance instructions
                  <textarea
                    className="mt-1 min-h-48 w-full rounded-lg border bg-background p-3 text-sm"
                    value={conversationalOptions.performanceInstructions}
                    aria-label="Performance instructions"
                    maxLength={PERFORMANCE_MAX}
                    disabled={playing || busy !== null || !status}
                    onChange={(e) => saveConversationalOptions({ ...conversationalOptions, performanceInstructions: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Conversational audition cue
                  <textarea
                    className="mt-1 min-h-28 w-full rounded-lg border bg-background p-3 text-sm"
                    value={conversationalOptions.conversationalCue}
                    aria-label="Conversational audition cue"
                    maxLength={CUE_MAX}
                    disabled={playing || busy !== null || !status}
                    onChange={(e) => saveConversationalOptions({ ...conversationalOptions, conversationalCue: e.target.value })}
                  />
                </label>
                <Button type="button" variant="outline" disabled={playing || busy !== null || !status}
                  onClick={() => saveConversationalOptions({ ...DEFAULT_CONVERSATIONAL_OPTIONS })}>
                  Reset to Default
                </Button>
                <VoiceReferenceMatcher disabled={playing || busy !== null || !status} onApply={saveConversationalOptions} />
                {auditionInvalid && <p role="alert" className="text-sm text-destructive">{auditionInvalid}</p>}
                {conversationalValidation.success && (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-medium">Exact GPT-Live audition request</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-xs">{JSON.stringify({
                      instructions: auditionSessionConfig("tess", selected, "conversational", AUDITION_SPEAK_PROMPT, conversationalOptions).instructions,
                      input: auditionSessionConfig("tess", selected, "conversational", AUDITION_SPEAK_PROMPT, conversationalOptions).input,
                      reinforcement: auditionReinforcement("conversational", AUDITION_SPEAK_PROMPT, conversationalOptions),
                    }, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => void copy(auditionMode === "scripted" ? script : conversationalOptions.conversationalCue, "script")}
              >
                {copied === "script" ? "Copied" : auditionMode === "scripted" ? "Copy script" : "Copy cue"}
              </Button>
              <Button
                type="button"
                disabled={!selected || playing || busy !== null || !status?.auditionsEnabled || !!auditionInvalid}
                className="min-h-11"
                onClick={audition}
              >
                <Play />
                Hear selected voice
              </Button>
              {playing && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={stopAudition}
                  disabled={auditionState === "stopping"}
                >
                  <Square />
                  Stop
                </Button>
              )}
              {auditionState === "blocked" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void player.current?.resume()}
                >
                  <Play />
                  Enable audio
                </Button>
              )}
              <a
                href="https://platform.openai.com/playground"
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center rounded-lg bg-primary px-3 text-sm text-primary-foreground"
              >
                Open Playground ↗
              </a>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              In-app and Playground auditions are billable. In-app auditions stop on the server
              after 30 seconds, allow one at a time and are capped per day.
            </p>
          </Step>

          <audio ref={audioRef} controls aria-label="Voice audition audio" className="w-full" />
          <div>
            <p className="text-xs text-muted-foreground">Incoming audio level</p>
            <div
              role="meter"
              aria-label="Incoming audio level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(1, level * 8) * 100)}
              className="mt-1 h-3 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-primary transition-[width] duration-100"
                style={{ width: `${Math.min(100, level * 800)}%` }}
              />
            </div>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {auditionState === "playing"
              ? "Sound detected in incoming audio"
              : auditionState === "ready"
                ? "Connected — incoming audio is silent so far"
                : auditionState === "connecting"
                  ? "Connecting…"
                  : auditionState === "stopping"
                    ? "Audio stopped — closing session…"
                    : auditionState === "blocked"
                      ? "Tap Enable audio to allow playback"
                      : "No audition playing"}
          </p>
          {(spoken || trace.length > 0) && (
            <section className="rounded-2xl bg-surface p-3 text-xs">
              <p className="font-semibold">What OpenAI said (transcript)</p>
              <p className="mt-1">{spoken || "— nothing yet —"}</p>
              <p className="mt-3 font-semibold">Session events</p>
              <ul className="mt-1 space-y-0.5 font-mono text-muted-foreground">
                {trace.map((t, i) => (
                  <li key={i} className="break-all">
                    {(t.at / 1000).toFixed(1)}s {t.type}
                    {t.detail ? ` — ${t.detail}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="rounded-2xl bg-surface p-4">
            <h2 className="font-semibold">Recorded sample · free replay</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Each audition is recorded on this device only. Replaying is free; nothing is uploaded
              unless you share or download it.
            </p>
            {recording && <p className="mt-2 text-sm">● Recording incoming audio…</p>}
            {sampleNote && <p className="mt-2 text-sm text-muted-foreground">{sampleNote}</p>}
            {sample && sampleUrl ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm">
                  <strong>{sample.candidate}</strong> · {(sample.durationMs / 1000).toFixed(1)}s
                  {sample.partial ? " · partial" : ""}
                  {!sample.audible ? " · no speech detected" : ""}
                </p>
                <audio src={sampleUrl} controls aria-label="Recorded sample" className="w-full" />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" className="min-h-11" onClick={() => void shareSample(sample)}>
                    Share sample
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => downloadSample(sample)}
                  >
                    Download sample
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => void removeSample()}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              !recording && <p className="mt-2 text-sm text-muted-foreground">No sample yet.</p>
            )}
          </section>
          {status?.auditionBlocker && (
            <p className="text-sm text-muted-foreground">{status.auditionBlocker}</p>
          )}

          <Step n={3} title="My saved voices · free selection" anchor="voice-saved">
            <p className="text-xs text-muted-foreground">
              Saved on this device. Picking here doesn't change anything in the app.
            </p>
            {selected && <div className="mt-3 rounded-xl border p-3">
              <p className="text-sm">Like this voice but want a different accent or delivery? Start from its original preset and edit a new version. Your selected voice stays saved.</p>
              <button type="button" className="mt-2 min-h-11 rounded-lg bg-primary px-3 text-sm text-primary-foreground" disabled={playing || busy !== null} onClick={refineSelectedCandidate}>Refine selected voice</button>
              <p className="mt-2 text-xs text-muted-foreground">New versions require paid creation. The original recording cannot be edited in place. Custom candidates use your latest saved Custom description, because the original text was not stored per candidate.</p>
            </div>}
            {current.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No {title(character)} candidates yet.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {current.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-start gap-3 rounded-xl border p-3 text-sm"
                  >
                    <input
                      type="radio"
                      name="candidate"
                      className="mt-1 h-5 w-5"
                      checked={selected === c.id}
                      disabled={playing}
                      onChange={() => setSelected(c.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="break-words">{c.name || `${title(character)} — ${c.variant}`}</strong>
                      <span className="block text-xs capitalize text-muted-foreground">
                        {c.variant} · {activeVoice?.voice_id === c.id ? "Phone voice" : "Saved candidate"}
                      </span>
                      <code className="mt-1 block select-all break-all text-xs">{c.id}</code>
                    </span>
                    <button
                      type="button"
                      className="min-h-9 shrink-0 rounded-lg border px-2 text-xs"
                      onClick={() => void copy(c.id, c.id)}
                    >
                      {copied === c.id ? "Copied" : "Copy ID"}
                    </button>
                  </label>
                ))}
              </div>
            )}
          </Step>

          <Step n={4} title="Use for phone calls">
            <p className="text-sm">
              Current {title(character)} phone voice:{" "}
              <strong>{activeVoice ? activeVoice.label || "Unnamed voice" : "None yet"}</strong>
            </p>
            {activeVoice && <code className="mt-1 block break-all text-xs">{activeVoice.voice_id}</code>}
            <p className="mt-2 text-xs text-muted-foreground">
              Pick a voice in My voices above, then tap the button. Everyone who calls {title(character)} hears this voice. Free; nothing is charged.
            </p>
            <Button
              type="button"
              className="mt-3 min-h-12 w-full"
              disabled={!selected || settingVoice || activeVoice?.voice_id === selected}
              onClick={() => void useForCalls()}
            >
              {activeVoice?.voice_id === selected && selected
                ? `This is ${title(character)}'s phone voice`
                : settingVoice
                  ? "Saving…"
                  : `Use chosen voice for ${title(character)}'s calls`}
            </Button>
          </Step>

          <Link to="/calls" className="block text-sm underline">
            Back to Calls
          </Link>
        </div>
      </Screen>
    </>
  );
}
