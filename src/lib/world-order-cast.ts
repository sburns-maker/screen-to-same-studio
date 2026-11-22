/**
 * World Order cast catalog.
 *
 * This registry describes potential simulation actors. It does NOT grant
 * everyone knowledge of the player's private conversations. Characters
 * become active only as story, geography and media events justify them.
 * Depictions of identifiable real public figures are fictionalized.
 */
export type WorldOrderRole =
  | "celebrity"
  | "world_leader"
  | "politician"
  | "journalist"
  | "business"
  | "citizen"
  | "organizer";
export type WorldOrderCharacter = {
  key: string;
  name: string;
  role: WorldOrderRole;
  location: string;
  publicFigure: boolean;
  description: string;
  goals: string[];
  knowledge: "public" | "contact" | "private";
  introduced: "opening" | "conditional";
};
export const WORLD_ORDER_CAST: WorldOrderCharacter[] = [
  {
    key: "sabrina", name: "Sabrina Carpenter", role: "celebrity", location: "United States",
    publicFigure: true, description: "Fictionalized depiction of the pop star; witty, independent, professionally busy, and grateful for a fictional concert rescue.",
    goals: ["Maintain personal autonomy", "Protect career and privacy", "Process the aftermath of the fictional incident"],
    knowledge: "contact", introduced: "opening",
  },
  {
    key: "anna", name: "Anna Kendrick", role: "celebrity", location: "United States",
    publicFigure: true, description: "Fictionalized entertainment-world contact who may appear through premieres, charities or media events.",
    goals: ["Pursue career projects", "Preserve reputation", "Choose alliances independently"],
    knowledge: "public", introduced: "conditional",
  },
  {
    key: "taylor", name: "Taylor Swift", role: "celebrity", location: "United States",
    publicFigure: true, description: "Fictionalized influential musician whose reactions and availability are never guaranteed.",
    goals: ["Protect public reputation", "Manage major creative ventures", "Support causes she independently chooses"],
    knowledge: "public", introduced: "conditional",
  },
  {
    key: "maya", name: "Maya Torres", role: "journalist", location: "New York, United States",
    publicFigure: false, description: "Fictional entertainment journalist with ambition, skepticism and access to industry circles.",
    goals: ["Break major stories", "Protect sources", "Advance journalism career"],
    knowledge: "contact", introduced: "opening",
  },
  {
    key: "elena", name: "Elena Valdés", role: "organizer", location: "Havana, Cuba",
    publicFigure: false, description: "Fictional civic coalition organizer prioritizing Cuban self-determination and transparent institutions.",
    goals: ["Organize democratic reforms", "Protect community", "Scrutinize foreign influence"],
    knowledge: "contact", introduced: "opening",
  },
  {
    key: "cuban_activist", name: "Rafael Morales", role: "citizen", location: "Havana, Cuba",
    publicFigure: false, description: "Fictional dockworker and community organizer who judges outsiders by actions rather than celebrity.",
    goals: ["Keep his family secure", "Improve local livelihoods", "Hold leaders accountable"],
    knowledge: "public", introduced: "conditional",
  },
  {
    key: "cuban_business", name: "Lucía Herrera", role: "business", location: "Havana, Cuba",
    publicFigure: false, description: "Fictional small-business owner navigating instability and opportunities.",
    goals: ["Grow her business", "Protect employees", "Influence economic policy"],
    knowledge: "public", introduced: "conditional",
  },
  {
    key: "us_reporter", name: "Nora Wells", role: "journalist", location: "Washington, DC, United States",
    publicFigure: false, description: "Fictional White House correspondent focused on political accountability.",
    goals: ["Ask difficult questions", "Verify rumors", "Maintain editorial independence"],
    knowledge: "public", introduced: "conditional",
  },
  {
    key: "us_senator", name: "Senator Evelyn Brooks", role: "politician", location: "Washington, DC, United States",
    publicFigure: false, description: "Fictional United States senator with an independent legislative agenda.",
    goals: ["Win reelection", "Build alliances", "Protect political standing"],
    knowledge: "public", introduced: "conditional",
  },
  {
    key: "investor", name: "Daniel Mercer", role: "business", location: "Miami, Florida, United States",
    publicFigure: false, description: "Fictional entrepreneur interested in Cuban reconstruction but driven by profit.",
    goals: ["Secure investments", "Manage commercial risk", "Expand business influence"],
    knowledge: "public", introduced: "conditional",
  },
  {
    key: "street_reporter", name: "Sofía Reyes", role: "journalist", location: "Havana, Cuba",
    publicFigure: false, description: "Fictional independent Cuban reporter whose coverage prioritizes residents.",
    goals: ["Investigate power", "Report local perspectives", "Protect journalistic independence"],
    knowledge: "public", introduced: "conditional",
  },
];
/**
 * Real-world office holders and leaders should be resolved by role and
 * accurate real-world date at story start; never hardcode a possibly stale
 * sitting president into fictional canon. Real people must not be assigned
 * invented private biographies or opinions and the game must remain labeled fiction.
 */
export const WORLD_ORDER_LEADER_ROLES = [
  { key: "us_president", role: "world_leader", office: "President of the United States", location: "Washington, DC, United States" },
  { key: "cuban_transition", role: "world_leader", office: "Cuban transitional leadership", location: "Havana, Cuba" },
  { key: "uk_pm", role: "world_leader", office: "Prime Minister of the United Kingdom", location: "London, United Kingdom" },
  { key: "canada_pm", role: "world_leader", office: "Prime Minister of Canada", location: "Ottawa, Canada" },
  { key: "eu_leadership", role: "world_leader", office: "European Union leadership", location: "Brussels, Belgium" },
  { key: "un_leadership", role: "world_leader", office: "United Nations leadership", location: "New York, United States" },
] as const;
export const WORLD_ORDER_CAST_RULES = {
  activeCharactersTarget: 16,
  activeCharactersMax: 20,
  perWorldCharacterCap: 200,
  scalableCatalogTarget: 200,
  disclosure: "FICTIONAL WORLD ORDER SIMULATION",
  privacy: "A character may only know public events, explicitly shared facts or directly witnessed interactions; gossip may be wrong.",
  canon: "Established facts may not be silently replaced; contradictions must be reconciled as events with explicit provenance.",
  agency: "Characters have independent goals; fame does not compel attraction, endorsements or votes.",
};

/** Limit named NPCs within one save; countries and unnamed background population do not use slots. */
export function canAddWorldCharacter(currentCount: number): boolean {
  return Number.isSafeInteger(currentCount) && currentCount >= 0 && currentCount < WORLD_ORDER_CAST_RULES.perWorldCharacterCap;
}

/** Simulation wakes only a bounded set for AI actions; all others keep structured state. */
export function scheduledActiveCharacters(count: number): number {
  return Math.max(0, Math.min(WORLD_ORDER_CAST_RULES.activeCharactersMax, Math.floor(Number.isFinite(count) ? count : 0)));
}
