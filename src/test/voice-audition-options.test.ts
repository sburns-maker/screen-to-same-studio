import { describe, expect, it } from "vitest";
import {
  auditionRequestSchema, auditionSessionConfig, auditionReinforcement,
  conversationalOptionsSchema, DEFAULT_CONVERSATIONAL_OPTIONS,
  restoreConversationalDraft, PERFORMANCE_MAX, CUE_MAX,
} from "@/lib/voice-audition-modes";
import { AUDITION_SPEAK_PROMPT, AUDITION_LIMIT_MS } from "@/lib/voice-studio-audition";

const edited = { performanceInstructions: "Speak softly with a little relief, without polished diction.", conversationalCue: 'I missed you. Was today "one of those days"?' };
describe("isolated editable conversational audition", () => {
  it("passes edited performance and cue through the server schema and both speech paths", () => {
    const request = auditionRequestSchema.parse({ character: "tess", voiceId: "voice_refinedSaved123", sdp: "existing-sdp-offer", mode: "conversational", ...edited, confirmation: "START PAID VOICE AUDITION" });
    const config = auditionSessionConfig(request.character, request.voiceId, request.mode, AUDITION_SPEAK_PROMPT, request);
    expect(config.instructions).toContain(edited.performanceInstructions);
    expect(config.input[0]?.content[0]?.text).toContain(JSON.stringify(edited.conversationalCue));
    expect(auditionReinforcement(request.mode, AUDITION_SPEAK_PROMPT, request)).toContain(edited.performanceInstructions);
    expect(auditionReinforcement(request.mode, AUDITION_SPEAK_PROMPT, request)).toContain(config.input[0]?.content[0]?.text);
    expect(config.audio.output.voice.id).toBe("voice_refinedSaved123");
    expect(AUDITION_LIMIT_MS).toBe(30_000);
    expect(DEFAULT_CONVERSATIONAL_OPTIONS.performanceInstructions).not.toBe(edited.performanceInstructions);
  });
  it("keeps scripted speech independent of conversational edits", () => {
    const a = auditionSessionConfig("tess", "voice_refinedSaved123", "scripted", AUDITION_SPEAK_PROMPT, edited);
    const b = auditionSessionConfig("tess", "voice_refinedSaved123", "scripted", AUDITION_SPEAK_PROMPT);
    expect(a).toEqual(b);
    expect(auditionReinforcement("scripted", AUDITION_SPEAK_PROMPT, edited)).not.toContain(edited.performanceInstructions);
  });
  it("roundtrips edits including unfinished drafts and safely restores defaults", () => {
    expect(restoreConversationalDraft(JSON.stringify(edited))).toEqual(edited);
    expect(restoreConversationalDraft(JSON.stringify({ ...edited, conversationalCue: "" })).conversationalCue).toBe("");
    expect(restoreConversationalDraft(null)).toEqual(DEFAULT_CONVERSATIONAL_OPTIONS);
    expect(restoreConversationalDraft("broken json")).toEqual(DEFAULT_CONVERSATIONAL_OPTIONS);
    expect(restoreConversationalDraft(JSON.stringify({ ...edited, performanceInstructions: 12 }))).toEqual(DEFAULT_CONVERSATIONAL_OPTIONS);
  });
  it("rejects empty performance instructions", () => {
    expect(conversationalOptionsSchema.safeParse({ ...edited, performanceInstructions: "   " }).success).toBe(false);
  });
  it("rejects empty cues", () => {
    expect(conversationalOptionsSchema.safeParse({ ...edited, conversationalCue: "" }).success).toBe(false);
  });
  it("bounds performance instructions at 4000 characters", () => {
    expect(PERFORMANCE_MAX).toBe(4000);
    expect(conversationalOptionsSchema.safeParse({ ...edited, performanceInstructions: "x".repeat(4000) }).success).toBe(true);
    expect(conversationalOptionsSchema.safeParse({ ...edited, performanceInstructions: "x".repeat(4001) }).success).toBe(false);
  });
  it("bounds cues at 2000 characters", () => {
    expect(CUE_MAX).toBe(2000);
    expect(conversationalOptionsSchema.safeParse({ ...edited, conversationalCue: "x".repeat(2000) }).success).toBe(true);
    expect(conversationalOptionsSchema.safeParse({ ...edited, conversationalCue: "x".repeat(2001) }).success).toBe(false);
  });
  it("still requires explicit paid confirmation", () => {
    expect(auditionRequestSchema.safeParse({ character: "tess", voiceId: "voice_refinedSaved123", sdp: "existing-sdp-offer", mode: "conversational", ...edited }).success).toBe(false);
  });
});