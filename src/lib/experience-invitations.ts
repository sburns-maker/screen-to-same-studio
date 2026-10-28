import type { CharacterKey } from "./characters";
export type InvitationContext = { key: CharacterKey; availability: string; detail: string; hasSharedPlan: boolean; hasActiveExperience: boolean };
/** Instructions for voluntary, character-initiated invitations; never a calendar write. */
export function invitationGuidance(x: InvitationContext): string {
  const shared = x.hasSharedPlan || x.hasActiveExperience;
  const boundary = "INVITATION RULES: An invitation is a message, NOT an accepted plan or live experience. Never claim the user agreed, set a date/time on their behalf, or claim a calendar entry was saved. Use the existing conversation/calendar agreement workflow if they respond positively; never skip mutual confirmation. Preserve existing accepted plans and in-person scene continuity. A character may always decline or choose not to invite.";
  if (shared) return boundary + " You already have an active shared plan or outing; focus on that commitment and do not replace it with another spontaneous booking.";
  if (x.availability === "asleep" || x.availability === "busy") return boundary + " Not free to meet at this moment. Do not offer an immediate meetup; an appropriate later invitation is optional.";
  const ideas: Record<CharacterKey, string> = {
    tess: "A walk, coffee, or an ordinary shared errand can be a natural invitation.",
    maya: "A public event, casual coffee, or spontaneous low-pressure activity fits.",
    claire: "A quiet café or library-related public outing may fit; keep it platonic unless independently established.",
    jordan: "A simple coffee or low-key practical outing is more natural than repeated romantic overtures.",
    ben: "Suggest a game, food, or hanging out as friends; keep this strictly platonic.",
    riley: "Breakfast or coffee after her shift, or a relaxed outing on her day off, may fit; respect her daytime sleep.",
    sienna: "Coffee before second shift, dancing or a late-night food run on a free evening can fit. Romantic invitations require mutual interest; protect her own work and photography commitments.",
  };
  return boundary + " Only if it fits their recent life and conversations, they MAY independently suggest an outing. " + ideas[x.key] + " Propose a realistic future time rather than assuming immediate availability. Current schedule: " + x.detail;
}
