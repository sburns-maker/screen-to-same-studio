export type RescuePhase = 0 | 1 | 2 | 3;
export type RescueChoice = "warn" | "move" | "security" | "shield" | "evacuate" | "guide" | "stay" | "press" | "evidence";
export type RescueBeat = { phase: RescuePhase; headline: string; scene: string; choices: { id: RescueChoice; label: string; note: string }[] };
export const RESCUE_BEATS: RescueBeat[] = [
  { phase: 0, headline: "Something is wrong", scene: "The concert is electric. Sabrina is midway through a song when you notice someone forcing their way toward the stage. Security hasn't reacted. An audience member screams. You have seconds to decide what to do.", choices: [
    { id: "warn", label: "Shout a warning and point out the danger", note: "Get everyone paying attention" },
    { id: "move", label: "Move toward Sabrina and alert her team", note: "Reach the stage-side personnel" },
    { id: "security", label: "Flag down security and direct the crowd away", note: "Coordinate a safer response" },
  ] },
  { phase: 1, headline: "Seconds to act", scene: "The situation escalates. A guard reaches the stage, but Sabrina is still exposed. The crowd surges toward the exits. You're close enough to influence what happens next.", choices: [
    { id: "shield", label: "Put yourself between Sabrina and the danger", note: "Personal risk, immediate protection" },
    { id: "evacuate", label: "Help clear a safe path offstage", note: "Protect everyone around you" },
    { id: "guide", label: "Signal Sabrina and her security toward cover", note: "Direct the coordinated response" },
  ] },
  { phase: 2, headline: "The world is watching", scene: "Security contains the fictional attack. Sabrina is safe, though the crowd is shaken. Cameras find you beside the stage. Reporters are already broadcasting. Your final choice will shape how people remember what happened.", choices: [
    { id: "stay", label: "Stay with Sabrina and check that she's okay", note: "Personal trust over publicity" },
    { id: "press", label: "Address the cameras and call for calm", note: "A public moment that spreads worldwide" },
    { id: "evidence", label: "Give investigators your account first", note: "Credibility through cooperation" },
  ] },
];
export type RescueRecord = { phase: RescuePhase; action: string; narrative: string; approach: "care" | "courage" | "leadership" | "evidence" };
export function rescueChoice(phase: RescuePhase, choice: RescueChoice): RescueRecord | null {
  const beat = RESCUE_BEATS.find(b => b.phase === phase);
  const selected = beat?.choices.find(c => c.id === choice);
  if (!selected) return null;
  const narratives: Record<RescueChoice, string> = {
    warn: "Your warning cuts through the music. People turn, and security responds a crucial moment sooner.",
    move: "You push toward stage-side staff and point out the threat. The team recognizes the danger.",
    security: "You get the attention of a guard and help direct frightened concertgoers away from the commotion.",
    shield: "You step between Sabrina and the danger as security rushes forward. Your bravery is caught on camera.",
    evacuate: "You clear a path through the commotion. Sabrina's team uses the opening to get her to safety.",
    guide: "You direct Sabrina and her team toward cover. Guards quickly contain the threat.",
    stay: "You ignore the cameras and ask Sabrina if she's okay. She notices your concern.",
    press: "You face the cameras, ask everyone to stay calm, and become the face of the unfolding story.",
    evidence: "You speak with investigators before the press. Your detailed account becomes important to the inquiry.",
  };
  const approach: RescueRecord["approach"] = ["stay", "evacuate", "move"].includes(choice) ? "care" : ["warn", "shield"].includes(choice) ? "courage" : ["security", "guide", "press"].includes(choice) ? "leadership" : "evidence";
  return { phase, action: selected.label, narrative: narratives[choice], approach };
}
export function rescueAdvancePhase(phase: RescuePhase): RescuePhase {
  return phase >= 3 ? 3 : (phase + 1) as RescuePhase;
}
export function rescueOutcome(records: RescueRecord[]) {
  if (records.length !== 3 || records.some((r, i) => r.phase !== i)) throw new Error("Complete all three rescue beats in order");
  const last = records[2]!.approach;
  return {
    followers: last === "leadership" ? 3_400_000 : last === "care" ? 1_900_000 : 2_350_000,
    reputation: last === "care" ? 78 : last === "evidence" ? 75 : 68,
    influence: records.filter(r => r.approach === "leadership").length * 4 + 12,
    summary: "You helped protect Sabrina Carpenter during a fictional concert attack. " + records.map(r => r.narrative).join(" "),
    sabrinaMessage: last === "care" ? "You stayed with me when the cameras were everywhere. I won't forget that. Thank you." : "I saw what you did. I don't know how to thank you yet, but I'd really like to talk.",
  };
}
