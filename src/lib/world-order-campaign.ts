import { availableCampaignEpisodes, campaignEpisode } from "./world-order-campaign-episodes";
/**
 * World Order's persistent post-opening campaign.
 * This is a small deterministic story engine, not a substitute for a future
 * autonomous world simulation. Its decisions, consequences, and relationships
 * persist in each world's save.
 */
export type CampaignRoute = "reform" | "investment" | "diplomacy";
export type CampaignActor = "Elena" | "Sofía" | "Lucía" | "Rafael" | "Mercer" | "Nora";
export type CampaignChoice = { id: string; title: string; detail: string; support: number; influence: number; stability: number; actor: CampaignActor; trust: number; outcome: string };
export type CampaignScene = { id: string; title: string; setup: string; location: string; character: string; objective: string; choices: CampaignChoice[] };
export type CampaignDecision = { scene: string; choice: string; day: number; outcome: string };
export type CampaignState = {
  stage: number; support: number; stability: number; relations: Partial<Record<CampaignActor, number>>;
  decisions: CampaignDecision[]; lastOutcome: string;
  position: "outsider" | "delegate" | "candidate" | "president";
};
export function initialCampaign(): CampaignState {
  return { stage: 0, support: 15, stability: 44, relations: {}, decisions: [], lastOutcome: "", position: "outsider" };
}
const option = (id: string, title: string, detail: string, support: number, influence: number, stability: number, actor: CampaignActor, trust: number, outcome: string): CampaignChoice =>
  ({ id, title, detail, support, influence, stability, actor, trust, outcome });

const routes: Record<CampaignRoute, CampaignScene[]> = {
  reform: [
    { id: "reform-townhall", title: "A crowd in Old Havana", location: "Havana · Community hall", character: "Rafael Morales", objective: "Earn the trust of a skeptical neighborhood",
      setup: "Rafael, a dockworker and community organizer, stands up during your first public forum. 'I don't care how famous you are. What are you actually going to do for my family?' The room goes quiet.",
      choices: [
        option("listen", "Let Rafael speak and take questions", "Listen before making promises.", 11, 2, 4, "Rafael", 16, "Rafael invites workers and residents into the discussion. The room warms to you, but expects a written plan."),
        option("promise", "Promise immediate sweeping reforms", "Gain attention but risk overpromising.", 7, 7, -8, "Rafael", -9, "Applause erupts, but Rafael demands to know how you'll deliver. Organizers split over your announcement."),
        option("committee", "Ask Elena to form a citizen committee", "Build a decision-making process.", 8, 4, 8, "Elena", 12, "Elena agrees to help establish an open committee. Critics call the process too slow."),
      ] },
    { id: "reform-leak", title: "A leaked meeting", location: "Havana · Independent newsroom", character: "Sofía Reyes", objective: "Respond to an investigation without silencing the press",
      setup: "Sofía publishes evidence that an ally has been meeting privately with powerful former officials. She offers you a chance to respond before the next article goes live.",
      choices: [
        option("investigate", "Invite an independent investigation", "Accountability might cost you an ally.", 8, 3, 10, "Sofía", 15, "Sofía calls your response unusually transparent. An influential ally withdraws support."),
        option("deny", "Dismiss the report in public", "Protect allies, risk public trust.", -9, 6, -10, "Sofía", -16, "Your rebuttal dominates the news, but documents keep circulating and the controversy escalates."),
        option("meet", "Meet Sofía and share what you know", "Offer cooperation without promises.", 4, 3, 4, "Sofía", 8, "Sofía reports your cooperation while continuing her investigation."),
      ] },
    { id: "reform-vote", title: "A constitutional convention", location: "Havana · Assembly chamber", character: "Elena Valdés", objective: "Create a legitimate route toward political leadership",
      setup: "Delegates are fighting over the rules of a transitional election. Elena says you could support independent monitoring—or push for a faster appointment that critics would reject.",
      choices: [
        option("election", "Back independently monitored elections", "Legitimacy before speed.", 12, 4, 10, "Elena", 18, "Delegates agree to draft election safeguards. Your allies prepare for a difficult campaign."),
        option("appointment", "Campaign for emergency appointment", "A faster route with serious opposition.", -5, 12, -16, "Elena", -13, "Your supporters cheer, but a coalition walks out and calls for a public vote."),
        option("compromise", "Negotiate a timed transition agreement", "Build a fragile consensus.", 7, 7, 6, "Elena", 9, "Rival groups agree to further talks with a defined timetable and public oversight."),
      ] },
  ],
  investment: [
    { id: "investment-workers", title: "The workers' ultimatum", location: "Havana · Port district", character: "Lucía Herrera", objective: "Negotiate a recovery project that residents will support",
      setup: "Lucía introduces you to small-business owners and union representatives. They will back your recovery plan only if it protects local jobs and ownership.",
      choices: [
        option("local", "Reserve ownership and hiring for locals", "Sacrifice some leverage to build trust.", 13, 2, 9, "Lucía", 17, "Lucía brings local businesses into the partnership. Investors demand revised terms."),
        option("investor", "Offer investors greater control", "Secure fast funding but lose local goodwill.", -8, 12, -6, "Mercer", 14, "Mercer offers financing. Dockworkers organize a protest over the ownership terms."),
        option("phased", "Negotiate a phased local-ownership plan", "Balance workers and investors.", 8, 6, 6, "Lucía", 10, "A phased agreement moves ahead, though both sides insist on independent oversight."),
      ] },
    { id: "investment-blackout", title: "A city goes dark", location: "Havana · Emergency coordination room", character: "Rafael Morales", objective: "Decide which part of the recovery project gets help first",
      setup: "A major power outage hits several neighborhoods. Rafael demands immediate relief; Mercer warns that diverting funds could jeopardize a long-term deal.",
      choices: [
        option("relief", "Prioritize hospitals and neighborhoods", "Public welfare first.", 15, 1, 9, "Rafael", 20, "Emergency crews restore essential services first. Investors complain about the altered schedule."),
        option("contracts", "Protect the signed investment contracts", "Keep the commercial timetable.", -13, 10, -12, "Mercer", 12, "The contracts remain intact, but residents demonstrate outside your office."),
        option("bridge", "Negotiate emergency bridge funding", "Find a compromise under pressure.", 8, 6, 7, "Lucía", 11, "Lucía coordinates a relief partnership. It helps, but some districts still face delays."),
      ] },
    { id: "investment-ownership", title: "Who owns the future?", location: "Havana · Trade summit", character: "Daniel Mercer", objective: "Set the rules for your growing business influence",
      setup: "Mercer proposes a powerful exclusive development deal. Lucía warns it could place too much of the economy under one corporation's control.",
      choices: [
        option("transparent", "Open the bids to competition", "Create transparent, fairer terms.", 12, 3, 10, "Lucía", 14, "Independent bidders enter the process. Mercer threatens to leave, but new local partners emerge."),
        option("exclusive", "Accept the exclusive deal", "Concentrate leverage quickly.", -11, 16, -11, "Mercer", 19, "Mercer commits major funding. Critics accuse you of selling influence."),
        option("public", "Create a public-private oversight board", "Maintain leverage with transparency.", 7, 8, 5, "Lucía", 9, "A mixed board approves a conditional deal and publishes its terms."),
      ] },
  ],
  diplomacy: [
    { id: "diplomacy-delegates", title: "Nobody trusts the table", location: "Havana · Conference center", character: "Elena Valdés", objective: "Bring rival factions into the same room",
      setup: "Two delegations threaten to walk out before talks begin. Elena says both demand guarantees that their opponents will be heard.",
      choices: [
        option("listen", "Offer equal speaking time and observers", "Build legitimacy slowly.", 11, 3, 8, "Elena", 15, "Both delegations stay. No agreement is signed, but talks finally begin."),
        option("pressure", "Threaten to cut off negotiations", "Force a decision, risk a collapse.", -8, 12, -12, "Elena", -14, "One group returns to the table; another refuses to recognize your authority."),
        option("shuttle", "Meet each group separately", "Find common ground privately.", 7, 7, 4, "Elena", 9, "You uncover a narrow area of agreement, though the press suspects a secret bargain."),
      ] },
    { id: "diplomacy-press", title: "The reporter at the door", location: "Havana · Press briefing", character: "Sofía Reyes", objective: "Answer allegations of backroom diplomacy",
      setup: "Sofía asks whether foreign officials are deciding Cuba's future without its citizens. The cameras are live, and the delegations are watching.",
      choices: [
        option("transparency", "Release the talks' public framework", "Expose the process to scrutiny.", 12, 3, 8, "Sofía", 18, "Sofía reports the release of a framework. Delegates argue over what can remain confidential."),
        option("evasive", "Decline to discuss the negotiations", "Preserve confidentiality at a cost.", -7, 8, -8, "Sofía", -15, "Your silence fuels speculation and protesters demand independent observers."),
        option("joint", "Invite citizen observers to future sessions", "Give residents a voice in the process.", 10, 4, 7, "Sofía", 13, "Sofía calls the proposal meaningful, provided observers have real access."),
      ] },
    { id: "diplomacy-deal", title: "The proposed accord", location: "Havana · Summit chamber", character: "Elena Valdés", objective: "Build a regional agreement without sacrificing legitimacy",
      setup: "A draft agreement offers economic support in exchange for concessions. Local representatives fear the deal will diminish their independence.",
      choices: [
        option("citizens", "Require local ratification", "Give people a binding voice.", 13, 4, 10, "Elena", 16, "The accord moves to public debate rather than immediate approval. Regional partners agree to keep talking."),
        option("sign", "Sign the agreement immediately", "Claim momentum, risk a backlash.", -10, 13, -14, "Elena", -14, "Leaders pose for photos, but public opposition threatens implementation."),
        option("rewrite", "Renegotiate the disputed clauses", "Try to salvage consensus.", 8, 8, 5, "Elena", 11, "The negotiating teams return with a revised text and new oversight provisions."),
      ] },
  ],
};
const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * Each campaign stage selects a fresh encounter. Milestones still appear at
 * stages 3, 7, 11, ... but the three introductory scenes are never replayed.
 * The first 12 new episodes are specific to the chosen route; then the world
 * opens into the other two political/economic/diplomatic tracks.
 */
export function currentCampaignScene(route: CampaignRoute, campaign: CampaignState): CampaignScene {
  const stage = campaign.stage;
  if (stage % 4 === 3) {
    const milestone = Math.floor(stage / 4);
    const currentPosition = campaign.position;
    if (currentPosition === "president") {
      const governance = [
        ["A confidence vote over health reform", "Doctors and opposition delegates challenge the government's access plan.", "Rafael Morales"],
        ["A cabinet reshuffle", "Two ministers disagree over the direction of your administration.", "Elena Valdés"],
        ["The regional autonomy dispute", "Provincial representatives demand a larger say in public decisions.", "Sofía Reyes"],
        ["An independent ethics inquiry", "A review panel questions whether a senior adviser has a conflict of interest.", "Nora Wells"],
        ["A diplomatic accountability hearing", "Foreign partners ask you to explain the terms of a proposed accord.", "Elena Valdés"],
        ["The public infrastructure audit", "Auditors say major projects face delays and cost pressures.", "Lucía Herrera"],
      ] as const;
      const issue = governance[(milestone - 3 + governance.length) % governance.length]!;
      return {
        id: "governance-confidence:" + milestone,
        title: issue[0], location: "Havana · National assembly", character: issue[2],
        objective: "Maintain accountable leadership while facing organized opposition",
        setup: issue[1] + " This is the assembly's oversight hearing number " + (milestone - 2) +
          " under your government. Members cite your most recent public decisions and demand specific answers.",
        choices: [
          option("hearing", "Open the records and answer publicly", "Welcome scrutiny and negotiate solutions.", 8, 2, 7, "Elena", 10, "Representatives receive the requested records and debate a practical reform."),
          option("compromise", "Propose an amended policy with deadlines", "Build a working agreement across factions.", 6, 7, 5, "Lucía", 8, "Several opposing delegates agree to revised terms and future review."),
          option("executive", "Use executive authority to bypass objections", "Act quickly while risking an institutional backlash.", -12, 12, -13, "Sofía", -14, "The policy moves forward, but watchdogs and opposition parties challenge the procedure."),
        ],
      };
    }
    return {
      id: "leadership-mandate:" + milestone,
      title: currentPosition === "president" ? "A vote of confidence" :
        currentPosition === "candidate" ? "The national ballot" :
        currentPosition === "delegate" ? "A presidential nomination" : "A seat at the table",
      location: "Havana · Public assembly",
      character: "Elena Valdés",
      objective: currentPosition === "president" ? "Maintain a public mandate" : "Seek a legitimate mandate—or earn more support",
      setup: currentPosition === "president" ?
        "An opposition coalition calls for a confidence review of your administration. Elena reminds you that power is conditional: your critics are citizens too." :
        currentPosition === "candidate" ?
        "Candidates prepare for a national contest. Independent observers insist that a fair vote matters more than your popularity on television. Your opponents are campaigning hard." :
        currentPosition === "delegate" ?
        "The transition assembly is choosing its official nominees. Elena says your coalition has grown, but other candidates have formidable supporters and independent agendas." :
        "An assembly opens debate over new civic leadership. Elena asks whether your support extends beyond viral fame and whether you will accept a decision that goes against you.",
      choices: [
        option("mandate", currentPosition === "president" ? "Submit to a public confidence review" : "Seek a public mandate", "Public support and stability determine what happens.", 1, 3, -2, "Elena", 3, "You present your case to the public."),
        option("coalition", "Negotiate a broader coalition first", "Strengthen your position with legitimate partners.", 9, 4, 8, "Elena", 12, "Your coalition invites rival groups into structured talks."),
        option("pressure", "Demand immediate recognition", "Risk resistance and declining public trust.", -8, 9, -13, "Elena", -15, "A contentious demand for recognition divides the assembly."),
      ],
    };
  }
  if (stage < 3) return routes[route][stage]!;
  // Route-specific episode 0 begins at stage 4. Every fourth stage is a
  // political milestone, so those are skipped in the episode index.
  const idx = stage - 4 - Math.floor((stage - 4) / 4);
  const routeCount = availableCampaignEpisodes(route);
  if (idx < routeCount) return campaignEpisode(route, idx)!;
  // Crossing into a different branch of the same world introduces new issues
  // without erasing the player's chosen initial approach.
  const otherRoutes = (["reform", "investment", "diplomacy"] as const).filter(r => r !== route);
  const crossed = idx - routeCount;
  if (crossed < routeCount * 2) {
    const source = otherRoutes[Math.floor(crossed / routeCount)]!;
    const episode = campaignEpisode(source, crossed % routeCount)!;
    return {
      ...episode,
      id: route + ":crossroads:" + episode.id,
      objective: episode.objective + " as part of your wider " + route + " strategy",
    };
  }
  // Past the finite authored arcs, evolve tensions from the actual state and
  // prior decisions. No original scene text or mission ID is repeated.
  const cycle = idx - routeCount * 3;
  const subjects = [
    ["The provincial council's challenge", "Camagüey", "Rafael Morales", "Public service promises are under review"],
    ["A cabinet resignation", "Havana", "Elena Valdés", "An ally has quit the coalition and demands reform"],
    ["The new trading coalition", "Cienfuegos", "Lucía Herrera", "Business groups dispute new contract terms"],
    ["A confidential recording", "Santiago de Cuba", "Sofía Reyes", "Journalists publish contested meeting notes"],
    ["An international summit", "Kingston", "Nora Wells", "A regional alliance seeks guarantees about your leadership"],
    ["The opposition's petition", "Santa Clara", "Elena Valdés", "A rival coalition demands a public hearing"],
    ["The community hospital dispute", "Matanzas", "Rafael Morales", "Health staff protest an unfulfilled commitment"],
    ["A major investor withdraws", "Mariel", "Daniel Mercer", "Project sponsors challenge your investment terms"],
  ] as const;
  const item = subjects[cycle % subjects.length]!;
  const pressure = campaign.support < 35 ? "Public confidence is low." :
    campaign.stability < 35 ? "Institutions are under severe strain." :
    campaign.position === "president" ? "Your administration now carries responsibility for every promise." :
    "Your increasing influence is drawing new allies and opponents.";
  const recent = campaign.decisions.slice(-2).map(d => d.outcome).join(" ");
  return {
    id: route + ":evolving:" + stage,
    title: item[0] + " · Day " + stage,
    location: item[1] + " · Council chamber",
    character: item[2],
    objective: item[3],
    setup: item[3] + ". " + pressure + " After the latest decisions—" + (recent || "several disputed proposals") +
      "—community representatives have brought new demands before you. Different factions disagree about how to proceed.",
    choices: [
      option("hear", "Hear the opposing proposals in public", "Seek accountability and compromise.", 8, 3, 5, "Elena", 9, "The factions agree to another documented session with independent oversight."),
      option("resolve", "Offer a specific, conditional agreement", "Move ahead while accepting scrutiny.", 5, 8, 2, "Lucía", 7, "A provisional agreement is put in writing while opponents prepare amendments."),
      option("impose", "Push your preferred solution through", "Gain short-term control at political cost.", -10, 10, -10, "Rafael", -12, "The proposal advances over objections and sparks further political resistance."),
    ],
  };
}
export function applyCampaignChoice(route: CampaignRoute, state: CampaignState, id: string, day: number) {
  const scene = currentCampaignScene(route, state);
  const choice = scene.choices.find(c => c.id === id);
  if (!choice || !Number.isInteger(day) || day < 1) return null;
  const relations = { ...state.relations };
  // Relations start neutral (50) and can rise or fall with decisions.
  relations[choice.actor] = clamp((state.relations[choice.actor] ?? 50) + choice.trust);
  const support = clamp(state.support + choice.support);
  const stability = clamp(state.stability + choice.stability);
  let position = state.position;
  let outcome = choice.outcome;
  if (scene.id.startsWith("leadership-mandate:") && choice.id === "mandate") {
    const newStage = state.stage + 1;
    const threshold = position === "outsider" ? 38 : position === "delegate" ? 57 : 75;
    const stabilityThreshold = position === "outsider" ? 35 : position === "delegate" ? 45 : 55;
    if (position === "president") {
      outcome = "You face a confidence review. The public debate continues, and rivals demand accountability.";
    } else if (support >= threshold && stability >= stabilityThreshold &&
      (position !== "candidate" || newStage >= 12)) {
      position = position === "outsider" ? "delegate" : position === "delegate" ? "candidate" : "president";
      const titles = { delegate: "a recognized transition delegate", candidate: "an officially nominated presidential candidate", president: "president following a contested public election", outsider: "an outsider" };
      outcome = "The assembly's public process gives you a new mandate: " + titles[position] + ". Opposition groups remain active.";
    } else {
      outcome = "Your bid for a broader mandate falls short. Voters and delegates ask for stronger support, stability and a clearer plan. You can try again after rebuilding your coalition.";
    }
  }
  const next: CampaignState = {
    stage: state.stage + 1, support, stability, position, relations,
    decisions: [...state.decisions, { scene: scene.id, choice: choice.id, day, outcome }].slice(-100),
    lastOutcome: outcome,
  };
  return { scene, choice: { ...choice, outcome }, state: next };
}
/** Restores older playtest worlds into the first playable campaign scene. */
export function normalizeCampaign(raw: unknown): CampaignState {
  const fresh = initialCampaign();
  if (!raw || typeof raw !== "object") return fresh;
  const v = raw as Partial<CampaignState>;
  return {
    stage: Number.isSafeInteger(v.stage) && (v.stage ?? 0) >= 0 ? Math.min(1000, v.stage!) : 0,
    support: Number.isFinite(v.support) ? clamp(v.support!) : fresh.support,
    stability: Number.isFinite(v.stability) ? clamp(v.stability!) : fresh.stability,
    relations: v.relations && typeof v.relations === "object" ? v.relations : {},
    decisions: Array.isArray(v.decisions) ? v.decisions.slice(-100) : [],
    lastOutcome: typeof v.lastOutcome === "string" ? v.lastOutcome : "",
    position: ["outsider", "delegate", "candidate", "president"].includes(v.position ?? "") ? v.position! : "outsider",
  };
}
