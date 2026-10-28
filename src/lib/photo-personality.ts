import { ordinaryWardrobeChoice, sceneOutfit } from "./photo-wardrobe";
import {physicalPhotoContext} from "./calendar-commitment";
import type { CharacterKey } from "./characters";
import type { PhotoStyle } from "./tess-photos";
import type { TessActivity } from "./tess-life";
export const PHOTO_SCENARIOS = [
  "post_work",
  "at_home",
  "dog_walk",
  "venue_update",
  "coffee_break",
  "outdoor_walk",
  "playful_reply",
  "reaction_selfie",
  "outfit_check",
  "cooking",
  "thinking_of_you",
  "special_occasion",
] as const;
export type PhotoScenario = (typeof PHOTO_SCENARIOS)[number];
export type PhotographyProfile = {
  key: string;
  styles: readonly string[];
  expressions: readonly string[];
  settings: readonly string[];
  wardrobe: readonly string[];
  hairstyles: readonly string[];
  selfies: readonly string[];
  captionVoice: string;
  spontaneity: number;
  hours: number;
  messages: number;
  subjects: string;
  scenarios: Partial<Record<PhotoScenario, number>>;
};
export const PHOTOGRAPHY_PROFILES = {
  kendra: {
    key: "kendra",
    styles: ["confident front-camera selfies", "casual unposed everyday snapshots", "occasional polished outfit shots"],
    expressions: ["playful knowing smile", "relaxed and sleepy at home", "focused or tired after a shoot"],
    settings: ["apartment", "actual shoot or casting break", "gym", "actual night out"],
    wardrobe: ["established lounge clothes", "athletic wear", "trendy going-out outfit when established"],
    hairstyles: ["reference-compatible messy blonde bun", "loose blonde waves", "backward cap when established"],
    selfies: ["natural front camera", "outfit check", "a detail from her actual surroundings"],
    captionVoice: "Playful, teasing and confident; flirty when she feels it, ordinary when she doesn't. Never shares private client work.",
    spontaneity: 0.8, hours: 5, messages: 3,
    subjects: "everyday life, workouts, outfits, nights out, shoots without client details and confident natural selfies",
    scenarios: { outfit_check: 1.6, playful_reply: 1.4, post_work: 1.2, thinking_of_you: 1.3 },
  },
  sienna: {
    key: "sienna",
    styles: ["observant lifestyle framing", "natural spontaneous front-camera snapshots"],
    expressions: ["confident unforced smile", "playful when genuinely amused", "thoughtful or tired when appropriate"],
    settings: ["current cocktail bar break", "apartment", "actual photography outing", "local cafe"],
    wardrobe: ["established practical bar-shift clothing", "casual fitted tee and jeans", "season-appropriate road-trip layers"],
    hairstyles: ["reference-compatible loose copper-red hair", "practical tied-back hair when established"],
    selfies: ["natural front camera", "confident outfit check", "a photographic detail from her actual surroundings"],
    captionVoice: "Direct, witty and affectionate when earned; not every caption flirts. Client privacy and her own boundaries remain intact.",
    spontaneity: 0.75, hours: 6, messages: 3,
    subjects: "photography, ordinary home life, cocktails without client details, music, actual outings and confident natural selfies",
    scenarios: { outfit_check: 1.5, playful_reply: 1.4, post_work: 1.3, thinking_of_you: 1.3 },
  },
  riley: {
    key: "riley",
    styles: ["ordinary shift-break details", "unposed everyday phone snapshots"],
    expressions: ["focused when occupied", "neutral or tired after a shift", "genuine amusement when warranted", "warm unforced expression"],
    settings: ["hospital staff break room without patient details", "apartment kitchen at noon", "local cafe", "Altoona night streets"],
    wardrobe: ["established shift scrubs; an outer layer only if already worn", "casual cardigan and jeans", "soft oversized sweater", "simple fitted casual blouse"],
    hairstyles: ["reference-compatible blonde curls", "practical tied-back curls when established for work", "loose curls when established"],
    selfies: ["occasional break-time selfie", "activity detail first", "mirror only when actually present"],
    captionVoice: "Playfully sarcastic, warm, naturally funny, independent; never imply attraction that has not developed.",
    spontaneity: 0.44, hours: 9, messages: 5,
    subjects: "night-shift observations, coffee, odd dreams, music, ordinary local life, a rare sleepy selfie",
    scenarios: { coffee_break: 1.5, reaction_selfie: 1.2, post_work: 1.4, playful_reply: 1.2 }
  },

  tess: {
    key: "tess",
    styles: ["deadpan visual humor", "restrained, casual phone framing"],
    expressions: ["deadpan", "subtle smirk when amused", "restrained smile", "neutral or absorbed in the current activity"],
    settings: ["home", "veterinary clinic break", "coffee shop", "Mabel walk", "outdoor errands"],
    wardrobe: [
      "denim-blue blouse or relaxed button-down",
      "olive or rust casual knit",
      "cream cardigan with an everyday top",
      "burgundy or muted teal sweater",
      "casual jeans with a varied-color tee",
      "season-appropriate outdoor jacket",
    ],
    hairstyles: ["loose waves", "ponytail", "casual updo", "messy bun"],
    selfies: ["reaction selfie", "unposed desk photo", "casual front camera"],
    captionVoice:
      "Dry, clever, concise observations; understated teasing or subtle affection when earned. Do not explain the joke.",
    spontaneity: 0.5,
    hours: 8,
    messages: 4,
    subjects:
      "dry everyday observations, clinic desk breaks, Mabel, cooking; occasional unposed selfie",
    scenarios: {
      dog_walk: 1.5,
      coffee_break: 1.3,
      reaction_selfie: 1.5,
      playful_reply: 1.3,
      cooking: 1.2,
    },
  },
  maya: {
    key: "maya",
    styles: ["expressive casual snapshots", "candid everyday moments"],
    expressions: [
      "warm smile when warranted",
      "playful expression when warranted",
      "focused during a task",
      "tired or unguarded expression when warranted",
    ],
    settings: [
      "event venue",
      "home kitchen or entryway",
      "coffee shop",
      "outdoor social event",
      "after work",
    ],
    wardrobe: [
      "denim jacket over a colored tee",
      "sage green casual blouse",
      "soft cream or lavender knit",
      "practical event-work clothing",
      "relaxed after-work outfit",
    ],
    hairstyles: ["loose waves", "slightly messy after work", "casual ponytail"],
    selfies: ["spontaneous front camera", "imperfect candid", "situational selfie"],
    captionVoice:
      "Warm, playful, conversational and specific. Allow genuine tiredness or vulnerability; do not manufacture cheerfulness.",
    spontaneity: 0.75,
    hours: 6,
    messages: 3,
    subjects:
      "adventures, event preparations, places she's actually visiting, casual expressive selfies",
    scenarios: { venue_update: 1.7, post_work: 1.4, thinking_of_you: 1.3, reaction_selfie: 1.2 },
  },
  claire: {
    key: "claire",
    styles: ["quiet details", "thoughtful everyday framing"],
    expressions: ["soft natural expression", "reflective", "absorbed in a discovery", "small unforced smile"],
    settings: ["garden", "nature walk", "home", "library or teaching context when established"],
    wardrobe: ["practical understated layers", "comfortable everyday clothes"],
    hairstyles: [
      "natural everyday hair",
      "practical tied-back variation when compatible with reference",
    ],
    selfies: ["occasional understated selfie", "environment first"],
    captionVoice:
      "Thoughtful, specific, calm observations. Let a small discovery stand without a generic question or repeated inside joke.",
    spontaneity: 0.45,
    hours: 12,
    messages: 5,
    subjects: "garden, plants, small outdoor discoveries; an occasional quiet natural selfie",
    scenarios: { outdoor_walk: 1.6, at_home: 1.2, coffee_break: 0.9 },
  },
  jordan: {
    key: "jordan",
    styles: ["understated intentional framing", "a specific detail with dry humor"],
    expressions: ["composed", "neutral concentration", "wry when amused", "natural small smile when it fits"],
    settings: ["current everyday surroundings", "coffee break", "quiet outdoors"],
    wardrobe: ["understated practical casual clothing"],
    hairstyles: ["reference-compatible everyday variation"],
    selfies: ["selective casual selfie", "specific object or detail first"],
    captionVoice:
      "Brief, dry, direct and meaningful. Allow sincerity; no automatic emotional challenge, deflection or performative guardedness.",
    spontaneity: 0.22,
    hours: 24,
    messages: 8,
    subjects: "a specific interesting detail worth sharing; rarely a selfie, never a performance",
    scenarios: { coffee_break: 1.3, playful_reply: 1.2, reaction_selfie: 0.7 },
  },
  ben: {
    key: "ben",
    styles: ["practical snapshots", "ordinary oddities and projects"],
    expressions: ["wry amusement when warranted", "relaxed", "matter-of-fact", "focused on a task"],
    settings: ["current work break", "home", "outdoors"],
    wardrobe: ["practical everyday clothing appropriate to the activity"],
    hairstyles: ["reference-compatible everyday hair"],
    selfies: ["occasional casual selfie", "project or object first"],
    captionVoice:
      "Plainspoken friendly humor, entirely platonic; concise project updates without claiming unestablished work was completed.",
    spontaneity: 0.34,
    hours: 12,
    messages: 5,
    subjects: "an everyday oddity, project or joke; entirely platonic",
    scenarios: { outdoor_walk: 1.2, at_home: 1.2, playful_reply: 1.3 },
  },
} satisfies Record<CharacterKey, PhotographyProfile>;
const neutral: PhotographyProfile = {
  key: "unregistered",
  styles: ["ordinary phone snapshot"],
  expressions: ["appropriate to current mood"],
  settings: [],
  wardrobe: [],
  hairstyles: [],
  selfies: ["context dependent"],
  captionVoice: "Use the established character dialogue voice.",
  spontaneity: 0.25,
  hours: 12,
  messages: 5,
  subjects: "a grounded everyday observation",
  scenarios: {},
};
/** Future NPCs may supply an approved typed profile; this never grants photo capability or identity approval. */
export function photographyProfile(
  key: string,
  supporting?: Readonly<Record<string, PhotographyProfile>>,
): PhotographyProfile {
  return Object.hasOwn(PHOTOGRAPHY_PROFILES, key)
    ? PHOTOGRAPHY_PROFILES[key as CharacterKey]
    : (supporting?.[key] ?? neutral);
}
export type PhotoLocation =
  "home" | "clinic" | "venue" | "coffee_shop" | "library" | "garden" | "outdoors" | "work" | "social" | "grocery" | "vehicle";
export function photoLocation(text: string): PhotoLocation | null {
  text = physicalPhotoContext(text);
  if (/\b(?:or|maybe|planning|might)\b|\//i.test(text)) return null;
  // A current room/location outranks references to a previous workday or groceries.
  if(/\b(?:at (?:her |his |my |your |the )?home|in (?:her |his |my |your |the )?(?:kitchen|living room|entryway|apartment|house))\b/i.test(text))return "home";
  if (/\b(?:grocery store|supermarket|grocery shopping|grocery aisle)\b/i.test(text) && !/\b(?:away|at home|home)\b/i.test(text)) return "grocery";
  if (/\b(?:driving|in the car|in my car)\b/i.test(text)) return "vehicle";
  if (
    /\b(?:(?:at|in|inside) (?:the |her |his )?(?:veterinary )?clinic|clinic office|veterinary clinic|clinic break)\b/i.test(
      text,
    )
  )
    return "clinic";
  if (/\b(?:at|inside|in|working at) (?:the |her |his )?(?:event )?venue\b/i.test(text))
    return "venue";
  if (
    /\b(?:at home|home after|arriv\w* home|in (?:her |his |the )?(?:kitchen|living room|entryway))\b/i.test(
      text,
    )
  )
    return "home";
  if (/\b(?:at|in|inside) (?:a |the )?(?:bar|pub|restaurant|trivia night|dinner date)\b|\b(?:bar trivia|trivia team|night out|book club gathering)\b/i.test(text)) return "social";
  if (/\b(?:coffee shop|cafe|café)\b/i.test(text)) return "coffee_shop";
  if (/\b(?:at|in|inside) (?:the |her |his )?library\b/i.test(text)) return "library";
  if (/\b(?:in (?:the |her |his )?garden|gardening)\b/i.test(text)) return "garden";
  if (/\b(?:walking|walk|outdoors|outdoor|park|trail)\b/i.test(text)) return "outdoors";
  if (/\b(?:at work|workplace)\b/i.test(text)) return "work";
  return null;
}
export type VisualContinuity = {
  hairstyle: string | null;
  clothing: string | null;
  objects: string[];
  weather: string | null;
};
export type PhotographyPlan = {
  version: 1;
  character: string;
  scenario: PhotoScenario | null;
  candidates: PhotoScenario[];
  location: PhotoLocation | null;
  availability: TessActivity["availability"];
  continuity: VisualContinuity;
  continuitySource: "recent_delivered_photo" | "current_context_only";
  continuityReason: string;
  recentSubjects?: PhotoSubject[];
  recentStyles?: PhotoStyle[];
  captureDecision?: string;
  ordinaryWardrobe?: string | null;
  outfitLocked?: boolean;
  outfitEpisode: "same_day" | "new_day" | "context_transition" | "unestablished";
};
export type DeliveredPhoto = {
  character: string;
  at: string;
  location: PhotoLocation | null;
  style: PhotoStyle;
  objects: string[];
};
export function planPhotography(args: {
  character: string;
  key: string;
  now: Date;
  schedule: TessActivity;
  userText?: string;
  weather?: string | null;
  previous?: DeliveredPhoto | null;
  recentSubjects?: PhotoSubject[];
  recentStyles?: PhotoStyle[];
}): PhotographyPlan {
  const profile = photographyProfile(args.character),
    text = physicalPhotoContext(`${args.schedule.activity} ${args.schedule.detail}`),
    location = photoLocation(text),
    candidates: PhotoScenario[] = [];
  const user = args.userText ?? "";
  const available =
    args.schedule.availability !== "asleep" &&
    args.schedule.availability !== "busy" &&
    !/\b(?:driv(?:e|es|ing)|surgery|emergency|patients?|phone (?:down|away))\b/i.test(text);
  if (available) {
    if (location === "home") candidates.push("at_home");
    if (location === "home" && /after work|after (?:an? |the )?event|post.work/i.test(text))
      candidates.push("post_work");
    if (location === "outdoors" && /\b(?:Mabel|dog)\b/i.test(text)) candidates.push("dog_walk");
    if (location === "venue") candidates.push("venue_update");
    if (/\b(?:coffee break|coffee shop|cafe|café)\b/i.test(text)) candidates.push("coffee_break");
    if (location === "outdoors" || location === "garden") candidates.push("outdoor_walk");
    if (/\b(?:cooking|baking|making dinner)\b/i.test(text)) candidates.push("cooking");
    if (/\b(?:birthday|celebration|gathering|anniversary)\b/i.test(text))
      candidates.push("special_occasion");
    if (/\b(?:haha|lol|funny|joking|kidding)\b|😂|🤣/i.test(user)) candidates.push("playful_reply");
    if (/\b(?:reaction selfie|your reaction|show me your face|look on your face)\b/i.test(user))
      candidates.push("reaction_selfie");
    if (/\b(?:outfit|wearing|jacket|sweater)\b/i.test(user)) candidates.push("outfit_check");
    if (/\bthinking (?:of|about) you\b/i.test(user)) candidates.push("thinking_of_you");
  }
  let hash = 2166136261;
  for (const c of args.key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const total = candidates.reduce((n, c) => n + (profile.scenarios[c] ?? 1), 0);
  let draw = ((hash >>> 0) / 4294967296) * total;
  const scenario =
    candidates.find((c) => {
      draw -= profile.scenarios[c] ?? 1;
      return draw < 0;
    }) ?? null;
  const previous = args.previous;
  const age = previous ? args.now.getTime() - Date.parse(previous.at) : Infinity;
  const sameDay = !!previous && age >= 0 &&
    new Intl.DateTimeFormat("en-CA", {timeZone: "America/New_York", year:"numeric",month:"2-digit",day:"2-digit"}).format(args.now) ===
    new Intl.DateTimeFormat("en-CA", {timeZone: "America/New_York", year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(previous.at));
  // Travel alone is not a wardrobe change. Retain known garments across locations.
  const explicitChange = /\b(?:changed (?:clothes|outfit)|got dressed|getting dressed|put on (?:my|a)|showered|dressed up)\b/i.test(text);
  const keepClothes = /\b(?:same (?:clothes|outfit|scrubs)|still wearing|haven['’]t changed|have not changed)\b/i.test(text);
  const arrivedHome = location === "home" && !!previous && previous.location !== "home";
  const futureChange = /\b(?:later|tomorrow|will change|going to change|before i change)\b/i.test(text);
  const requestedChange = /^(?:(?:please|could you|can you|would you)\s+)?(?:wear|put on|change into)\b/i.test(user.trim()) && !/\b(?:later|tomorrow)\b/i.test(user);
  const workLocations = ["work", "clinic", "venue"];
  const startsShift = workLocations.includes(location ?? "") && !!previous && !workLocations.includes(previous.location ?? "");
  const newEpisode = !keepClothes && ((explicitChange && !futureChange) || arrivedHome || startsShift || requestedChange);
  const continuousShift = age >= 0 && age <= 8 * 3600000 &&
    location === previous?.location && ["work", "clinic", "venue"].includes(location ?? "");
  const sameEpisode = sameDay || continuousShift;
  const retain =
    sameEpisode &&
    !newEpisode &&
    !!previous &&
    previous.character === args.character;
  const outfitEpisode: PhotographyPlan["outfitEpisode"] = !previous ? "unestablished" : newEpisode ? "context_transition" : !sameEpisode ? "new_day" : "same_day";
  const objects = [
    ...(/\bMabel\b/i.test(text) && location === "outdoors" ? ["Mabel"] : []),
    ...(/\bcoffee\b/i.test(text) ? ["coffee"] : []),
    ...(/\b(?:reading a book|reading her book|reading his book)\b/i.test(text) ? ["book"] : []),
  ];
  return {
    version: 1,
    character: args.character,
    scenario,
    candidates,
    location,
    availability: args.schedule.availability,
    outfitEpisode,
    outfitLocked: retain && !!previous?.style.clothing_category,
    ordinaryWardrobe: retain && previous.style.clothing_category
      ? previous.style.clothing_category
      : ordinaryWardrobeChoice(args.character, args.now, location, text),
    recentSubjects: (args.recentSubjects ?? []).slice(0, 6),
    recentStyles: (args.recentStyles ?? []).slice(0, 20),
    continuity: {
      hairstyle: retain ? (previous.style.hairstyle ?? null) : null,
      clothing: retain ? (previous.style.clothing_category ?? null) : null,
      objects,
      weather: args.weather ?? null,
    },
    continuitySource: retain ? "recent_delivered_photo" : "current_context_only",
    continuityReason: retain
      ? "Same local day or continuous overnight shift, with no established outfit change; retain visible clothes and hair through travel."
      : outfitEpisode === "context_transition" ? "An established change, arrival home or start of work permits a fresh outfit episode; the chosen next photo establishes the clothes." : "No established same-day outfit continuity; do not invent continuity.",
  };
}
export type PhotoSubject = "object" | "person";
/** Separate from outfit continuity: objects must count toward subject variety, never supply clothes. */
export function deliveredPhotoSubjects(
  messages: Parameters<typeof deliveredPhotoHistory>[0],
  character: string,
  now: Date,
): PhotoSubject[] {
  const subjects: PhotoSubject[] = [];
  const seen = new Set<string>();
  const personTypes = ["casual_selfie", "personal_selfie", "intimate_selfie", "tess_candid", "mature_romantic"];
  for (const m of [...messages].sort((a, b) =>
    (b.visible_at ?? b.created_at).localeCompare(a.visible_at ?? a.created_at))) {
    const at = Date.parse(m.visible_at ?? m.created_at);
    const md = m.metadata as {
      generated_path?: string;
      photo_type?: string;
      photo_identity?: { validationStatus?: string };
      photo_visual?: { version?: number; character?: string };
    } | null;
    if (m.sender !== "tess" || !Number.isFinite(at) || !Number.isFinite(Date.parse(m.created_at)) ||
      at > now.getTime() || at < now.getTime() - 24 * 3_600_000 ||
      typeof md?.generated_path !== "string" || !md.generated_path ||
      md.photo_identity?.validationStatus !== "screen_passed" ||
      md.photo_visual?.version !== 1 || md.photo_visual.character !== character ||
      (md.photo_type !== "object" && !personTypes.includes(md.photo_type ?? "")) ||
      seen.has(md.generated_path)) continue;
    seen.add(md.generated_path);
    subjects.push(md.photo_type === "object" ? "object" : "person");
    if (subjects.length === 6) break;
  }
  return subjects;
}

export function photoSubjectGuidance(subjects: readonly PhotoSubject[]): string {
  return `PHOTO SUBJECT BALANCE: A grounded photograph can include you; it does not need a new object, event, scenic view or visual punchline. An ordinary front-camera selfie, a reaction selfie, or a plausible candid of you doing your current activity can fit your personality just as naturally as a detail photo. Avoiding a repeated coffee or conversation topic does not mean avoiding your face. Subject choice is independent of framing and wardrobe variety. Respect the player's actual request and current context; never substitute a selfie when they asked to see a particular object. Only choose an eligible type if independently willing; a selfie boundary, privacy or being busy still applies. No required alternation, quota, new photographer, forced outfit change or escalation to romantic content. No photo remains valid.${subjects.length >= 2 && subjects[0] === "object" && subjects[1] === "object" ? " Your two most recent visible screened photos in the last 24 hours were object/environment-only. Consider an ordinary eligible photo with you in frame if you want to share, rather than reflexively finding another prop. This is a soft suggestion, never permission or an obligation." : ""}`;
}

export function photographyGuidance(plan: PhotographyPlan): string {
  const p = photographyProfile(plan.character);
  return `CATEGORY STYLING: mature_romantic is a deliberately suggestive but non-explicit photo category for consenting adult characters, distinct from the cozy affectionate intimate_selfie. When character willingness and current scene support it, permit ordinary believable lingerie, matching bra and underwear, bralette sets, satin slips, flattering necklines, or a partly open robe over underwear. Choose natural yet confident posing, subtle romantic tension, and authentic unfiltered phone-camera framing, not studio glamour, generic pajamas, or polished pinup aesthetics. These wardrobe examples are optional, not required: preserve established outfit and location continuity, personal boundaries, and character choice. No nudity, visible nipples or genitals, explicit acts, or pornographic poses. Provider moderation is authoritative; do not circumvent rejection. Keep existing category identifiers.\nPHOTOGRAPHY PERSONALITY (soft preferences, never permission): ${JSON.stringify(p)}\nGrounded scenario plan: ${JSON.stringify(plan)}\n${photoSubjectGuidance(plan.recentSubjects ?? [])}\nORDINARY PHOTO WARDROBE: ordinaryWardrobe is one character-specific fallback for this local day and activity, not a fact already established in dialogue. Use it only when no current clothing is established or explicitly requested. For ordinary photos choose concrete garment, color and fabric details rather than generic home_casual/work labels. Do not default everyone to the same knit, polo, hoodie or matching palette. Keep established clothes within a scene. This fallback does not apply to mature_romantic styling.\nPriority: approved canonical identity > factual continuity > user-established scene > tendencies > aesthetic defaults. Settings above are examples, not destinations or evidence. Do not invent visits, completed events, clothes, objects or relationships to fit a tag. Current outfit/hair/scene requests override defaults; keep a recent same-moment outfit or hairstyle unless the conversation establishes a change. Known location is current; never teleport back to a prior photo. Regional weather applies only when relevant to the actual setting; do not invent indoor lighting. Vary framing and expression, not established facts. Mood overrides expression tendencies. Captions are separate messages in your established dialogue voice, match only the actual selected scene and never become image text. Do not repeat recent jokes or signature phrases. A null scenario is valid; don't force a photo. These notes do not change eligibility, willingness, budgets or identity rules.`;
}
/** Sanitized structural diagnostics; no transcripts, image bytes, URLs, secrets or full prompts. */
function safe(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value) return null;
  return value
    .replace(/https?:\/\/\S+|\b\S+@\S+\b|\b(?:sk-|Bearer\s+)\S+|\b[\w-]{32,}\b/gi, "[redacted]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 140);
}
export function photographyDiagnostics(
  plan: PhotographyPlan,
  style: PhotoStyle | null | undefined,
) {
  return {
    profile: plan.character,
    scenario: plan.scenario,
    scenarioCandidates: plan.candidates,
    location: plan.location,
    availability: plan.availability,
    continuitySource: plan.continuitySource,
    recentDeliveredCount: plan.recentStyles?.length ?? 0,
    ordinaryWardrobe: safe(plan.ordinaryWardrobe),
    captureDecision: plan.captureDecision ?? "not_selected",
    continuityReason: plan.continuityReason,
    continuity: {
      hairstyle: safe(plan.continuity.hairstyle),
      clothing: safe(plan.continuity.clothing),
      objects: plan.continuity.objects.map((x) => safe(x)),
      weather: safe(plan.continuity.weather),
    },
    style: Object.fromEntries(Object.entries(style ?? {}).map(([k, v]) => [k, safe(v)])),
    promptComponents: [
      "approved canonical reference pixels",
      "current activity and location",
      "explicit scene and expression",
      "recent same-location continuity",
      "soft character tendencies",
      "existing global safety and phone realism",
      "separate caption, never an overlay",
    ],
  };
}
export function deliveredPhotoHistory(
  messages: { sender: string; created_at: string; visible_at?: string; metadata: unknown }[],
  character: string,
  now: Date,
): DeliveredPhoto[] {
  const result: DeliveredPhoto[] = [];
  for (const m of [...messages].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const visibleAt = Date.parse(m.visible_at ?? m.created_at);
    if (m.sender !== "tess" || !Number.isFinite(visibleAt) || !Number.isFinite(Date.parse(m.created_at)) || visibleAt > now.getTime()) continue;
    const md = m.metadata as {
      generated_path?: string;
      photo_type?: string;
      photo_identity?: { validationStatus?: string };
      photo_visual?: DeliveredPhoto & { version?: number };
    } | null;
    const v = md?.photo_visual;
    if (
      md?.generated_path &&
      [
        "casual_selfie",
        "personal_selfie",
        "intimate_selfie",
        "tess_candid",
        "mature_romantic",
      ].includes(md.photo_type ?? "") &&
      md.photo_identity?.validationStatus === "screen_passed" &&
      v?.version === 1 &&
      v.character === character &&
      v.style &&
      typeof v.style === "object"
    )
      result.push({
        ...v,
        at: m.created_at,
        style: Object.fromEntries(
          [
            "pose_type",
            "camera_angle",
            "crop_type",
            "hairstyle",
            "expression",
            "clothing_category",
            "setting",
            "selfie_type",
          ].map((k) => [
            k,
            typeof (v.style as Record<string, unknown>)[k] === "string"
              ? ((v.style as Record<string, string>)[k] ?? "").slice(0, 160)
              : null,
          ]),
        ),
        objects: Array.isArray(v.objects)
          ? v.objects.filter((x) => typeof x === "string").slice(0, 8)
          : [],
      });
  }
  return result.slice(0, 20);
}
export function previousDeliveredPhoto(
  messages: Parameters<typeof deliveredPhotoHistory>[0], character: string, now: Date,
): DeliveredPhoto | null {
  return deliveredPhotoHistory(messages, character, now)[0] ?? null;
}
/** Location contradictions are rejected, not repaired by inventing travel. Unknown context stays permissive. */
export function photoSceneCompatible(plan: PhotographyPlan, scene: string): boolean {
  const proposed = photoLocation(scene);
  return (
    !plan.location ||
    !proposed ||
    plan.location === proposed ||
    (plan.location === "work" && ["clinic", "venue"].includes(proposed))
  );
}
export function photoPersonalityPrompt(
  plan: PhotographyPlan,
  style: PhotoStyle | null | undefined,
  human = true,
): string {
  const p = photographyProfile(plan.character);
  if (!human)
    return `Current location category: ${plan.location ?? "unspecified"}. Scenario: ${plan.scenario ?? "unspecified"}. Photographic habits: ${p.styles.join("; ")}. Objects must come from the requested scene and current activity. Current relevant weather: ${plan.continuity.weather ?? "unknown; do not invent"}. Do not add a human to an object-only photo. Captions belong to the separate chat message, never an image overlay.`;
  return `Priority: canonical facial identity first, factual current context second, explicit scene third, soft tendencies last. Current location category: ${plan.location ?? "unspecified; do not infer from preferred settings"}. Scenario tag: ${plan.scenario ?? "none; do not invent an activity"}.\nContinuity hints, only if still true and not explicitly changed: ${JSON.stringify(plan.continuity)}.\nSoft photographic tendencies: ${p.styles.join("; ")}. Expression options only when the requested expression/mood is unspecified: ${p.expressions.join("; ")}. For ordinary photos only, if neither the scene, requested style nor established continuity specifies actual garments, use this single character/day/activity fallback: ${plan.ordinaryWardrobe ?? "choose from the character's established style"}. It is a proposed outfit, not a remembered fact. Clothing tendencies are secondary: ${p.wardrobe.join("; ")}. Do not combine all the alternatives or copy the reference portrait clothes. Mature styling uses the approved scene instead of this ordinary fallback. Hairstyle possibilities only if none is established/requested: ${p.hairstyles.join("; ")}. These do not change the reference's hair-color family, facial features, age or identity.\nRequested style remains authoritative over tendencies: ${JSON.stringify(style ?? {})}. Do not add a human to an object-only photo. Avoid repeating compositions while retaining current facts. Work uniforms may repeat without repeating the pose, camera angle, expression or background crop. Expressions follow actual mood; never rotate emotions for variety. Captions belong to the separate chat message; no caption text or overlays in this photo.`;
}
/** Preserve established episode clothes; scene wardrobe controls an unlocked episode. */
export function continuityPhotoStyle(
  plan: PhotographyPlan,
  proposed: PhotoStyle,
  scene: string,
  allowSceneWardrobeChange = false,
): PhotoStyle {
  const explicitHair = /\b(?:hair|bun|ponytail|waves|braid|updo)\b/i.test(scene);
  const explicitClothes =
    /\b(?:wearing|dressed|sweater|shirt|top|jacket|coat|hoodie|outfit|cardigan|dress)\b/i.test(
      scene,
    );
  return {
    ...proposed,
    hairstyle:
      proposed.hairstyle ??
      (!explicitHair && plan.outfitEpisode === "same_day" ? plan.continuity.hairstyle : null),
    clothing_category: plan.outfitLocked && plan.continuity.clothing && !allowSceneWardrobeChange
      ? plan.continuity.clothing
      : explicitClothes
      ? sceneOutfit(scene) ?? proposed.clothing_category ?? null
      : (plan.outfitEpisode === "same_day" ? plan.continuity.clothing : null) ??
        proposed.clothing_category ??
        null,
  };
}
