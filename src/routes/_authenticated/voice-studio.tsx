import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Screen, ScreenHeader } from "@/components/ScreenHeader";
import { VOICE_DESIGNS, type VoiceDesignKey } from "@/lib/live-voice-design";
import { createCharacterVoiceCandidate, voiceStudioStatus } from "@/lib/live-voice-design.functions";

export const Route = createFileRoute("/_authenticated/voice-studio")({ component: VoiceStudio });
type Variant = "natural" | "refined" | "playful";
type Candidate = { id: string; variant: Variant; character: VoiceDesignKey; approved: false };
const variants: Variant[] = ["natural", "refined", "playful"];
const script = "I have a complaint. About you, obviously. I haven't decided what you've done wrong yet, but I'm confident I'll find something. Have a lovely day.";
const characters = Object.keys(VOICE_DESIGNS) as VoiceDesignKey[];

function VoiceStudio() {
  const create = useServerFn(createCharacterVoiceCandidate);
  const statusFn = useServerFn(voiceStudioStatus);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof voiceStudioStatus>> | null>(null);
  const [error, setError] = useState("");
  const [character, setCharacter] = useState<VoiceDesignKey>("tess");
  const [busy, setBusy] = useState<Variant | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    let active = true;
    void statusFn().then((v) => { if (active) setStatus(v); })
      .catch((e) => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, [statusFn]);
  async function generate(variant: Variant) {
    if (!window.confirm(`Create a saved ${character} / ${variant} voice? Voice creation is explicit and this candidate will not be approved automatically.`)) return;
    setBusy(variant);
    setError("");
    try {
      const v = await create({ data: { character, variant, confirmation: "CREATE CUSTOM VOICE" } });
      setCandidates((old) => [...old, { ...v, character, variant }]);
      setSelected(v.id);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  const current = candidates.filter((c) => c.character === character);
  return (
    <>
      <ScreenHeader title="Voice Studio" backTo="/calls" />
      <Screen>
        <div className="space-y-4 pb-10">
          <section className="rounded-2xl bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Developer studio</p>
            <h1 className="mt-1 font-display text-2xl">Find their voice</h1>
            <p className="mt-2 text-sm text-muted-foreground">Design fictional character voices without turning on calls. Candidate creation saves a voice ID; it does not produce a recording. Listening requires a GPT-Live session in OpenAI's Playground.</p>
            {status ? (
              <div className="mt-3 space-y-1 text-sm">
                <p>OpenAI project key: <strong>{status.apiConfigured ? "Configured" : "Missing"}</strong></p>
                <p>Voice design: <strong>{status.creationEnabled ? "Enabled" : "Disabled"}</strong></p>
                <p>GPT-Live calls: <strong>{status.liveEnabled ? "Flag enabled (integration still requires testing)" : "Disabled"}</strong></p>
              </div>
            ) : <p className="mt-3 text-sm">Checking developer access…</p>}
            {error && <p role="alert" className="mt-2 rounded-lg border border-destructive p-2 text-sm">{error}</p>}
          </section>

          <label className="block text-sm font-medium">Character
            <select aria-label="Voice character" className="mt-1 min-h-12 w-full rounded-xl border bg-surface px-3" value={character} onChange={(e) => { setCharacter(e.target.value as VoiceDesignKey); setSelected(""); }}>
              {characters.map((c) => <option value={c} key={c}>{c[0].toUpperCase()+c.slice(1)}</option>)}
            </select>
          </label>

          <section className="rounded-2xl bg-surface p-4">
            <h2 className="font-semibold">{VOICE_DESIGNS[character].name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{VOICE_DESIGNS[character].description}</p>
            <p className="mt-3 text-xs text-muted-foreground">Saved server voice setting: {status?.approved[character] ? "Configured" : "Not configured"}</p>
          </section>

          <section className="rounded-2xl bg-surface p-4">
            <h2 className="font-semibold">Create three variations</h2>
            <p className="mt-1 text-xs text-muted-foreground">Creating a candidate does not activate it. A new voice is saved at OpenAI for each successful creation.</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {variants.map((v) => <button type="button" key={v} disabled={!status?.creationEnabled || !status.apiConfigured || busy !== null} onClick={() => void generate(v)} className="min-h-12 rounded-xl border px-2 text-sm capitalize disabled:opacity-40">{busy === v ? "Creating…" : v}</button>)}
            </div>
          </section>

          <section className="rounded-2xl bg-surface p-4">
            <h2 className="font-semibold">Saved candidates · this page</h2>
            <p className="mt-1 text-xs text-muted-foreground">Record the ID before leaving. These candidate cards live only in this browser page; OpenAI retains created voice objects in the project.</p>
            {current.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No candidates created during this visit.</p> :
              <div className="mt-3 space-y-2">{current.map((c) => <label key={c.id} className="flex items-start gap-2 rounded-xl border p-3 text-sm">
                <input type="radio" name="candidate" checked={selected === c.id} onChange={() => setSelected(c.id)} />
                <span className="min-w-0 flex-1"><strong className="capitalize">{c.variant}</strong><code className="mt-1 block break-all text-xs">{c.id}</code></span>
                <button type="button" className="underline" onClick={() => void navigator.clipboard.writeText(c.id)}>Copy ID</button>
              </label>)}</div>}
          </section>

          <section className="rounded-2xl bg-surface p-4">
            <h2 className="font-semibold">Audition selected voice</h2>
            <p className="mt-2 text-sm">Open the GPT-Live Playground, choose a saved voice ID, and use the same test script for each candidate:</p>
            <p className="mt-2 rounded-lg bg-background p-3 text-sm">{script}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => void navigator.clipboard.writeText(script)}>Copy script</button>
              {selected && <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => void navigator.clipboard.writeText(selected)}>Copy selected voice ID</button>}
              <a href="https://platform.openai.com/playground" target="_blank" rel="noopener noreferrer" className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">Open Playground ↗</a>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Voice audition sessions incur GPT-Live usage charges. Selection is not applied automatically. Add the winner as server setting GPT_LIVE_VOICE_{character.toUpperCase()}, then complete the separate live calling integration before enabling calls.</p>
          </section>
          <Link to="/calls" className="block text-sm underline">Back to Calls</Link>
        </div>
      </Screen>
    </>
  );
}
