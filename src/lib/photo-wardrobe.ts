import type { PhotoStyle } from "./tess-photos";

// Fictional fallback styling, not possessions or remembered facts. Separate
// capsules avoid a shared model default; established clothing always wins.
const everyday: Record<string, readonly string[]> = {
  kendra: ["oversized cropped hoodie and high-waisted leggings", "fitted ribbed tank and light-wash jeans", "black zip-front athletic top and joggers"],
  sienna: ["black scoop-neck cotton tee and straight-leg jeans", "emerald fitted blouse and charcoal trousers", "burgundy ribbed tank and a denim jacket with jeans"],
  tess: [
    "rust cotton henley and straight-leg jeans",
    "denim-blue linen button-down with stone trousers",
    "forest-green waffle-knit crewneck and faded jeans",
  ],
  maya: [
    "coral ribbed tee and wide-leg jeans",
    "plum wrap blouse with dark trousers",
    "ochre printed cotton shirt and denim skirt",
  ],
  riley: [
    "slate-blue jersey long-sleeve and relaxed jeans",
    "sage cotton pocket tee and canvas trousers",
    "dusty-rose ribbed tank with an unbuttoned chambray shirt and jeans",
  ],
  claire: [
    "moss-green corduroy overshirt with an ecru tee and jeans",
    "maroon cotton tunic with navy trousers",
    "indigo denim shirt and oatmeal linen trousers",
  ],
  jordan: [
    "navy textured button-down and grey trousers",
    "aubergine cotton crewneck and dark jeans",
    "sand-colored twill overshirt with a white tee and olive trousers",
  ],
  ben: [
    "brick-red flannel shirt and worn jeans",
    "heather-grey pocket tee with a blue canvas overshirt and jeans",
    "brown cotton work shirt and khaki trousers",
  ],
};
const sleepwear: Record<string, string> = {
  kendra: "grey ribbed lounge top and soft grey joggers",
  sienna: "soft charcoal sleep tee and cotton lounge shorts",
  tess: "faded navy sleep tee and loose cotton pajama trousers",
  maya: "mauve jersey sleep shirt and soft lounge shorts",
  riley: "loose grey sleep tee and blue plaid pajama trousers",
  claire: "pale-green cotton pajama shirt and matching trousers",
  jordan: "plain ivory sleep tee and dark lounge trousers",
  ben: "washed-blue sleep tee and grey jersey lounge shorts",
};

/** Stable for a local day and activity, never keyed to a random request/retry ID. */
export function ordinaryWardrobeChoice(
  character: string,
  now: Date,
  location: string | null,
  activity: string,
): string | null {
  const choices = Object.hasOwn(everyday, character) ? everyday[character] : undefined;
  if (!choices || !location) return null;
  if (
    location === "home" &&
    /\b(?:bedtime|sleepwear|pajamas|pyjamas|going to bed|getting into bed)\b/i.test(activity)
  )
    return sleepwear[character] ?? null;
  if (location === "clinic" || location === "work") {
    if (character === "riley")
      return "plain blue shift scrubs; no added hoodie or outer layer unless established";
    if (character === "tess")
      return "plain teal clinic scrubs; no added outer layer unless established";
    if (character === "maya") return "burgundy woven blouse and practical navy event-work trousers";
    return null; // Do not invent another character's job or uniform.
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === name)?.value);
  const day = Math.floor(Date.UTC(part("year"), part("month") - 1, part("day")) / 86400000);
  const outfit = choices[((day % choices.length) + choices.length) % choices.length];
  return location === "outdoors" || location === "garden"
    ? `${outfit}; add weather-appropriate outdoor layers only when current weather requires them`
    : (outfit ?? null);
}

const genericClothing =
  /^(?:(?:ordinary|comfortable|casual|practical|everyday|home|work|winter|hiking|going out|going_out|relaxed|clothes|clothing|outfit|wear|attire|adult|appropriate|and|for|the|season)[ _-]*)+$/i;
const garmentInScene =
  /\b(?:wearing|dressed|shirt|tee|t-shirt|henley|blouse|top|polo|sweater|knit|jacket|coat|hoodie|cardigan|dress|scrubs|uniform|robe|lingerie|pajamas|pyjamas|bra|bralette|tank|trousers|jeans|shorts|skirt|suit)\b/i;

/** Persist a concrete outfit already selected in scene prose, not a new invented garment. */
export function sceneOutfit(scene: string): string | null {
  const match = /\b(?:wearing|dressed in)\s+(.+?)(?=\s+(?:at|while|looking|standing|sitting|holding)\b|[.;\n]|$)/i.exec(scene);
  return match && garmentInScene.test(match[1] ?? "") ? match[1]!.trim().slice(0,160) : null;
}

/** Established episode clothes precede generated suggestions; unlocked scenes may choose new clothes. */
export function ordinaryPhotoStyle(
  style: PhotoStyle | null | undefined,
  scene: string,
  plan?: { outfitLocked?: boolean; ordinaryWardrobe?: string | null; continuity: { clothing: string | null } },
): PhotoStyle | null | undefined {
  if (plan?.outfitLocked && plan.continuity.clothing) return {...style,clothing_category:plan.continuity.clothing};
  const outfit = sceneOutfit(scene);
  if (outfit) return {...style, clothing_category:outfit};
  if (!plan || garmentInScene.test(scene)) return style;
  const current = style?.clothing_category?.trim();
  const known = plan.continuity.clothing;
  const fallback = known || plan.ordinaryWardrobe;
  if (!fallback || (current && !genericClothing.test(current))) return style;
  return { ...style, clothing_category: fallback };
}

/** Generated prose is not evidence that a character changed clothes. */
export function outfitContinuityPrompt(plan?: {outfitLocked?: boolean; continuity:{clothing:string|null}}): string {
  return plan?.outfitLocked && plan.continuity.clothing
    ? `CURRENT OUTFIT CONTINUITY: ${plan.continuity.clothing}. This is the established outfit for the current clothing episode. Preserve these garments, colors, fabric and layers. It takes precedence over conflicting wardrobe suggestions in the generated scene or reference portrait. Changing pose, crop, expression or background does not change the clothes. A future intention to change later is not a change now.`
    : "";
}
