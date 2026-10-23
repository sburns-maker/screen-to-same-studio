import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Square } from "lucide-react";
import {
  AUDITION_SCRIPT,
  createStudioAudition,
  type AuditionState,
  type AuditionTrace,
} from "@/lib/voice-studio-audition";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
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
const script = AUDITION_SCRIPT;
const characters = Object.keys(VOICE_DESIGNS) as VoiceDesignKey[];
const STORE = "voice-studio-candidates-v1";
const title = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

function Step({ n, title: t, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-4">
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
  const [copied, setCopied] = useState("");
  const [level, setLevel] = useState(0);
  const [spoken, setSpoken] = useState("");
  const [trace, setTrace] = useState<AuditionTrace[]>([]);
  const [variant, setVariant] = useState<Variant>("natural");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftKey = `${character}:${variant}`;
  const draft: Draft = drafts[draftKey] ?? presetDraft(character, variant);
  const invalid = validateVoiceRequest(draft.prompt, draft.name);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORE);
      if (raw) setDrafts(JSON.parse(raw) as Record<string, Draft>);
    } catch {
      /* ignore */
    }
  }, []);

  function saveDrafts(next: Record<string, Draft>) {
    setDrafts(next);
    try {
      localStorage.setItem(DRAFT_STORE, JSON.stringify(next));
    } catch {
      /* ignore */
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
    if (
      !window.confirm(
        "Start a paid audition, limited to 30 seconds? It won't affect character memories or calls.",
      )
    )
      return;
    setError("");
    setSpoken("");
    setTrace([]);
    setLevel(0);
    let auditionId: string | null = null;
    const release = () => {
      if (!auditionId) return;
      const id = auditionId;
      auditionId = null;
      // Server-side close + lease release; the server deadline still applies if this fails.
      void stopFn({ data: { auditionId: id } }).catch(() => {});
    };
    const session = createStudioAudition({
      audio: audioRef.current,
      connect: async (sdp) => {
        const r = await auditionFn({
          data: { character, voiceId: selected, sdp, confirmation: "START PAID VOICE AUDITION" },
        });
        auditionId = r.auditionId;
        return r;
      },
      onState: (state) => {
        setAuditionState(state);
        if (state === "closed") {
          player.current = null;
          release();
        }
      },
      onError: setError,
      onLevel: (l) => setLevel(l),
      onTranscript: setSpoken,
      onTrace: (t) => setTrace((prev) => [...prev.slice(-29), t]),
    });
    player.current = session;
    void session.start();
  }
  const current = candidates.filter((c) => c.character === character);
  const canCreate =
    !!status?.creationEnabled && !!status.apiConfigured && busy === null && !playing;

  return (
    <>
      <ScreenHeader title="Voice Studio" backTo="/calls" />
      <Screen>
        <div className="space-y-4 pb-10">
          <section className="rounded-2xl bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Developer studio
            </p>
            <h1 className="mt-1 font-display text-2xl">Find their voice</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Create and audition voices in AI Town. Auditions are isolated paid GPT-Live sessions,
              not character calls.
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
              Active phone voice: {status?.approved[character] ? "Set" : "None yet"}
            </p>
          </section>

          <Step n={1} title="Create a candidate">
            <p className="text-xs text-muted-foreground">
              Pick a preset or Custom, edit the description, then tap Create. Editing never creates a voice.
            </p>
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

          <Step n={2} title="Hear the selected voice">
            <p className="text-sm">
              Select a candidate below and listen to the same script with each voice:
            </p>
            <p className="mt-2 rounded-lg bg-background p-3 text-sm">{script}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-11 rounded-lg border px-3 text-sm"
                onClick={() => void copy(script, "script")}
              >
                {copied === "script" ? "Copied" : "Copy script"}
              </button>
              <Button
                type="button"
                disabled={!selected || playing || !status?.auditionsEnabled}
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
          {status?.auditionBlocker && (
            <p className="text-sm text-muted-foreground">{status.auditionBlocker}</p>
          )}

          <Step n={3} title="Pick your favorite">
            <p className="text-xs text-muted-foreground">
              Saved on this device. Picking here doesn't change anything in the app.
            </p>
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
                      <strong className="capitalize">{c.variant}</strong>
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

          <Step n={4} title="Activate for phone calls (manual)">
            <p className="text-sm">
              Nothing is activated automatically. When you've chosen, save the ID as server setting{" "}
              <code className="break-all">GPT_LIVE_VOICE_{character.toUpperCase()}</code>. Calls
              stay off until live calling is separately enabled and tested.
            </p>
            {selected && (
              <button
                type="button"
                className="mt-3 min-h-11 rounded-lg border px-3 text-sm"
                onClick={() => void copy(selected, "sel")}
              >
                {copied === "sel" ? "Copied" : "Copy chosen ID"}
              </button>
            )}
          </Step>

          <Link to="/calls" className="block text-sm underline">
            Back to Calls
          </Link>
        </div>
      </Screen>
    </>
  );
}
