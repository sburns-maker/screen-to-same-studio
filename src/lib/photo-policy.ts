import type { TessState } from "./tess-logic";
import { allowedGeneratedTypes, type GeneratedType } from "./tess-photos";

export type PhotoCategory = GeneratedType | "mature_romantic" | "suggestive" | "mature_nude";
export type PhotoBoundary = "none" | "selfies" | "all_photos" | "mature";
export type PhotoContext = {
  age: number;
  enabled: boolean;
  romanticCapable: boolean;
  supported: readonly string[];
  matureEnabled: boolean;
  /** Separate verified-adult and explicit-photo opt-ins. Never inferred from matureEnabled. */
  adultVerified?: boolean;
  nudeEnabled?: boolean;
  boundary: PhotoBoundary;
};

/** Technical support is not an invitation or a character's consent. */
export function photoCapabilities(c: PhotoContext): PhotoCategory[] {
  if (!c.enabled || !Number.isInteger(c.age) || c.age < 18) return [];
  const ordinary = c.supported.filter((t): t is GeneratedType =>
    ["object", "tess_candid", "casual_selfie", "personal_selfie", "intimate_selfie"].includes(t));
  return c.romanticCapable ? [...ordinary, "mature_romantic", "suggestive", "mature_nude"] : ordinary;
}

export function boundaryAllows(boundary: PhotoBoundary, type: PhotoCategory): boolean {
  if (boundary === "all_photos") return false;
  if (boundary === "selfies") return type === "object";
  return boundary !== "mature" || (type !== "mature_romantic" && type !== "suggestive" && type !== "mature_nude");
}

/** Romantic intent is independent of attraction, warmth, and photo willingness. */
export function romanticPhotoEligible(s: TessState, c: PhotoContext): boolean {
  return c.romanticCapable && s.comfort >= 65 && s.trust >= 55 &&
    s.emotional_intimacy >= 40 && s.romantic_attraction >= 45 &&
    s.romantic_intent >= 40 && s.perceived_pressure < 30 && s.irritation < 20;
}

/** More selective category; scores only establish eligibility, never willingness. */
export function suggestivePhotoEligible(s: TessState, c: PhotoContext): boolean {
  return romanticPhotoEligible(s, c) &&
    s.comfort >= 75 && s.trust >= 65 && s.emotional_intimacy >= 55 &&
    s.romantic_attraction >= 55 && s.romantic_intent >= 55 &&
    s.perceived_pressure < 20;
}

export function eligiblePhotoCategories(s: TessState, c: PhotoContext): PhotoCategory[] {
  const ordinary = allowedGeneratedTypes(s);
  return photoCapabilities(c).filter((t) => boundaryAllows(c.boundary, t) &&
    (t === "mature_romantic"
      ? c.matureEnabled && romanticPhotoEligible(s, c)
      : t === "suggestive"
        ? c.matureEnabled && suggestivePhotoEligible(s, c)
      : t === "mature_nude"
        ? c.matureEnabled && c.nudeEnabled === true && c.adultVerified === true && romanticPhotoEligible(s, c)
        : ordinary.includes(t)));
}

export function photoDecisionReason(args: {
  type: PhotoCategory; willing: boolean; contextual: boolean;
  framing: "ordinary" | "romantic"; eligible: readonly string[];
  state: TessState; context: PhotoContext;
}): string | null {
  if (!args.willing) return "character did not consent to share this photo";
  if (!args.contextual) return "character did not identify a contextual reason to share";
  if (!boundaryAllows(args.context.boundary, args.type))
    return `photo boundary blocks ${args.type} (boundary: ${args.context.boundary})`;
  if (!args.eligible.includes(args.type))
    return `photo category ${args.type} not eligible (allowed: ${args.eligible.join(", ") || "none"})`;
  if (args.type === "mature_nude" && (!args.context.adultVerified || !args.context.nudeEnabled))
    return "nude category requires verified adult and separate explicit opt-in";
  if ((args.type === "mature_romantic" || args.type === "suggestive" || args.type === "mature_nude") &&
      (!args.context.matureEnabled || args.framing !== "romantic"))
    return "mature romantic category requires enabled preference and romantic framing";
  if (args.framing === "romantic" && !romanticPhotoEligible(args.state, args.context))
    return "romantic framing blocked by relationship readiness";
  return null;
}

export function willingPhotoAllowed(args: Parameters<typeof photoDecisionReason>[0]): boolean {
  return photoDecisionReason(args) === null;
}

/** Refusals persist until the character independently reopens, without sending in that turn. */
export function nextPhotoBoundary(current: PhotoBoundary, decision: "unchanged" | "reopen" | Exclude<PhotoBoundary, "none">, hasPhoto: boolean): PhotoBoundary {
  if (decision === "unchanged") return current;
  if (decision === "reopen") return hasPhoto ? current : "none";
  return decision;
}

/** Allow adult non-nude lingerie styling; provider moderation remains authoritative. */
export function safePhotoScene(scene: string): boolean {
  return !/\b(nud(?:e|ity)|naked|topless|bottomless|genitals?|nipples?|porn(?:ographic)?|sex(?:ual)?\s+act(?:ivity)?|intercourse|masturbat\w*|see[ -]?through|sheer|schoolgirl|schoolboy|teen(?:ager)?|underage|child|minor)\b/i.test(scene);
}