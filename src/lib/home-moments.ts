import type { HousingHome, HousingSnapshot } from "./housing";

export type HomeMoment = {
  id: "coffee" | "movie" | "cook" | "mabel" | "photo" | "invite" | "myphoto";
  title: string;
  description: string;
  suggestion: string;
  category: "shared" | "solo";
};

export function homeMoments(
  home: HousingHome,
  snapshot: Pick<HousingSnapshot, "members">,
  character: string | undefined,
): HomeMoment[] {
  const livesHere = Boolean(character && snapshot.members.some(
    (member) => member.person_key === character &&
      member.residence_id === home.id && member.kind === "primary",
  ));
  const ownHome = !character;
  const canVisit = ownHome || home.canVisit;
  const moments: HomeMoment[] = [
    { id: "coffee", title: "Morning coffee", description: "A small everyday moment.", suggestion: "Want to have coffee together sometime at home?", category: "shared" },
    { id: "movie", title: "Cozy movie night", description: "A low-key evening together.", suggestion: "How about a relaxed movie night at home?", category: "shared" },
    { id: "cook", title: "Cook together", description: "Make dinner, laugh and catch up.", suggestion: "Want to cook dinner together at home?", category: "shared" },
  ];
  if ((character === "tess" && (livesHere || canVisit)) || (ownHome && snapshot.members.some(member => member.person_key === "tess" && member.residence_id === home.id)))
    moments.push({
      id: "mabel", title: "Mabel's corner",
      description: "Dog toys, walks, and little household surprises.",
      suggestion: "How's Mabel doing? What has she been up to around the house?",
      category: "shared",
    });
  if (character === "tess" && canVisit)
    moments.push({
      id: "photo", title: "Ask for a real photo",
      description: "A character may choose to take a new picture—never automatically.",
      suggestion: "If you're home and feel like it, could you send me a quick photo of what your place looks like right now?",
      category: "shared",
    });
  if (ownHome) {
    moments.push({
      id: "invite", title: "Invite Tess over",
      description: "Offer a visit to your own home—she decides whether to accept.",
      suggestion: "Would you like to come over to my place sometime?",
      category: "shared",
    });
    moments.push({
      id: "myphoto", title: "Decorate your space",
      description: "Talk about your home and share ideas.",
      suggestion: "I've been thinking about making my place cozier. Want to help me pick out a few ideas?",
      category: "solo",
    });
  }
  return moments;
}
