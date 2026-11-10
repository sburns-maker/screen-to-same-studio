import { referencePoseGuidance } from "./photo-reference-prompt";

/** Seedream 5.0 Flash/Pro edit prompt limit; the request builder enforces it too. */
export const SPICY_PROMPT_LIMITS = {
  "bytedance/seedream-5.0-flash/edit": 5000,
  "bytedance/seedream-5.0-pro/edit": 5000,
} as const;
export const spicyPromptLimit = (model: string) =>
  (SPICY_PROMPT_LIMITS as Record<string, number>)[model] ?? 5000;

export type SpicyPromptBudget = {
  limit: number;
  originalLength: number;
  finalLength: number;
  compression: "none" | "compressed" | "failed";
  valid: boolean;
};

const COMPACT_CATEGORY = {
  mature_romantic:
    "ROMANTIC CATEGORY: Private, non-explicit romantic photo of one clearly adult (18+) fictional person who independently chose it; flirtatious, sensual and personal, not a staged fashion shoot. Opaque lingerie, a slip, flattering neckline or robe over underwear only when consistent with her own style and the established outfit/scene. No nudity, exposed nipples or genitals, sexual activity, minors or age ambiguity. Provider moderation is authoritative; never evade a refusal.",
  suggestive:
    "SUGGESTIVE CATEGORY: Visibly flirtatious non-explicit adult portrait the character independently chose; confident body language and playful eye contact. Established clothing and room are authoritative; opaque clothing, no exposed nipples or genitals, no sexual acts or pornographic poses. Provider screening is authoritative.",
  ordinary: "",
} as const;

const COMPACT_QUALITY =
  "QUALITY: Photorealistic casual smartphone photo; natural skin, hands, hair and fabric. Preserve canonical adult body proportions; garments drape realistically, neither flattening nor enlarging the bust, showing only what the actual neckline allows. No editorial polish, text or watermarks. No nudity or explicit sexual acts. Preserve adult eligibility, boundaries and identity. No patient/client identities, private screens, records or identifying bystanders.";

function compactPose(style: Record<string, unknown>) {
  const target = ["pose_type", "camera_angle", "crop_type", "selfie_type", "expression"]
    .flatMap((k) => (typeof style[k] === "string" && style[k] ? [`${k}: ${String(style[k]).replaceAll("_", " ")}`] : []))
    .join("; ");
  return `REFERENCE ROLE: The reference sets stable identity only (face, age, features, hair-color family, body proportions), never the pose. Compose a fresh capture; keep the current scene, outfit, hairstyle and mood.\nTARGET CAPTURE: ${target || "one believable pose from the actual activity and mood"}. Do not reuse the reference shoulder silhouette, smile or lean.`;
}

/** Removes exact repeated sentences, keeping first occurrences in order. */
export function dedupeSentences(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => {
      const k = s.trim().toLowerCase().replace(/\s+/g, " ");
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(" ")
    .trim();
}

/** Short personality summary: retains location, scenario, continuity and the character's own habits. */
export type CompactPersonality = {
  character: string;
  location: string | null;
  scenario: string | null;
  continuity: unknown;
  styles: readonly string[];
  expressions: readonly string[];
  ordinaryWardrobe?: string | null;
};
function compactPersonality(p: CompactPersonality, style: Record<string, unknown>) {
  return `PHOTO PERSONALITY (${p.character}; soft tendencies, never permission): ${p.styles.join("; ")}. Expressions if unspecified: ${p.expressions.join("; ")}. Current location: ${p.location ?? "unspecified; do not infer"}. Scenario: ${p.scenario ?? "none"}. Continuity, if still true: ${JSON.stringify(p.continuity)}. Requested style is authoritative: ${JSON.stringify(style)}. ${p.ordinaryWardrobe ? `Ordinary outfit fallback only if no clothes are established: ${p.ordinaryWardrobe}.` : ""} Never invent an activity, emotion, outfit change or visit from these preferences. No caption text in the image.`;
}

/**
 * Deterministic two-step assembly. Full prompt first; if over the model's limit,
 * one compaction that keeps identity, scene, wardrobe, camera and safety lines
 * verbatim and only shortens descriptive guidance. Never cuts mid-instruction.
 */
export function composeSpicyPrompt(args: {
  model: string;
  base: string; // buildSpicyPrompt output (identity, category, wardrobe, scene, camera, quality, pose)
  personality: string;
  category: string;
  type: "mature_romantic" | "suggestive" | "ordinary";
  style: Record<string, unknown>;
  compact: CompactPersonality;
}): { prompt: string | null; budget: SpicyPromptBudget } {
  const limit = spicyPromptLimit(args.model);
  const full = [args.base, args.personality, args.category].filter(Boolean).join("\n");
  if (full.length <= limit)
    return { prompt: full, budget: { limit, originalLength: full.length, finalLength: full.length, compression: "none", valid: true } };
  const base = dedupeSentences(
    args.base
      .replace(referencePoseGuidance(args.style), compactPose(args.style))
      .replace(/QUALITY: [^\n]*/, COMPACT_QUALITY)
      .replace(/SCENE \/ LOCATION: [^\n]*/, (line) => `SCENE / LOCATION: ${dedupeSentences(line.slice(18))}`),
  ).replace(/ (?=(?:CATEGORY|WARDROBE|SCENE \/ LOCATION|POSE \/ EXPRESSION|CAMERA|LIGHTING|QUALITY|REFERENCE ROLE|TARGET CAPTURE):)/g, "\n");
  const compacted = [base, compactPersonality(args.compact, args.style), COMPACT_CATEGORY[args.type]]
    .filter(Boolean)
    .join("\n");
  const valid = compacted.length <= limit;
  return {
    prompt: valid ? compacted : null,
    budget: { limit, originalLength: full.length, finalLength: compacted.length, compression: valid ? "compressed" : "failed", valid },
  };
}
