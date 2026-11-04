/**
 * Pregnancy continuity for interactive fictional experiences.
 *
 * The player can refer to pregnancy, but a player claim does not create a
 * pregnancy event. Canonical records and previously delivered character-owned
 * disclosures must not be overwritten by an unsupported generated denial.
 */
export type PregnancyLifecycleState = "pregnant" | "ended" | "unknown";
export type ExperiencePregnancyEvidence = {
  disclosedPositive: boolean;
  lifecycle: PregnancyLifecycleState;
  characterSharedPositive: boolean;
  playerMentioned: boolean;
};
export type ExperiencePregnancyContinuity = {
  lines: string[];
  rejectUnverifiedDenial: boolean;
  source: "canonical_active" | "canonical_disclosure" | "shared_disclosure" | "player_claim" | "none";
};

export function characterPregnancyDisclosure(body: string): boolean {
  // Only the character's own unambiguous statement counts, not a player
  // supposition or a vague reference to a positive test of something else.
  const text = body.toLowerCase();
  if (/\b(?:i(?:['’]m| am) not pregnant|my pregnancy test (?:was|is|came back) negative)\b/.test(text)) return false;
  return /\b(?:i(?:['’]m| am) pregnant|my pregnancy test (?:was|is|came back) positive|we(?:['’]re| are) expecting (?:a|our) (?:baby|child))\b/.test(text);
}

export function playerPregnancyReference(body: string): boolean {
  return /\b(?:pregnan(?:t|cy)|our (?:little one|baby)|the baby (?:on the way|we(?:['’]re| are) expecting)|nursery)\b/i.test(body);
}

export function explicitPregnancyDenial(body: string): boolean {
  return /\b(?:i(?:['’]m| am) not pregnant|i(?:['’]m| am) definitely not pregnant|there (?:is|isn['’]t|is not) no (?:baby|pregnancy)|there (?:isn['’]t|is not) (?:a|any) (?:baby|little one) on the way|we(?:['’]re| are) not expecting|no (?:baby|little one) (?:is )?on the way)\b/i.test(body);
}

export function experiencePregnancyContinuity(e: ExperiencePregnancyEvidence): ExperiencePregnancyContinuity {
  if (e.disclosedPositive && e.lifecycle === "pregnant") {
    return {
      source: "canonical_active", rejectUnverifiedDenial: true,
      lines: ["AUTHORITATIVE SHARED PREGNANCY CANON: This character has a previously disclosed positive pregnancy event and an active pregnancy lifecycle. The player already knows. Do not deny the pregnancy, announce it as new, fabricate a birth, or change an outcome. Continue the actual shared history."],
    };
  }
  if (e.disclosedPositive && e.lifecycle === "ended") {
    return {
      source: "canonical_disclosure", rejectUnverifiedDenial: false,
      lines: ["AUTHORITATIVE PREGNANCY HISTORY: An earlier positive pregnancy result was disclosed but its canonical lifecycle has ended. Do not pretend that a currently active pregnancy remains or invent a new one. Refer to the recorded history sensitively if relevant."],
    };
  }
  if (e.disclosedPositive) {
    return {
      source: "canonical_disclosure", rejectUnverifiedDenial: true,
      lines: ["AUTHORITATIVE PREGNANCY HISTORY: A positive pregnancy test was already disclosed to the player. The active lifecycle is not confirmed by this read. Do not erase or deny the previously shared positive result, and do not invent a later medical outcome."],
    };
  }
  if (e.characterSharedPositive) {
    return {
      source: "shared_disclosure", rejectUnverifiedDenial: true,
      lines: ["RECORDED SHARED STORY CONTINUITY: The character previously told the player about a positive pregnancy or explicitly said she was pregnant. Do not contradict that visible disclosure or treat it as fresh news. This is conversation history, not authorization to create a canonical pregnancy event or invent medical outcomes."],
    };
  }
  if (e.playerMentioned) {
    return {
      source: "player_claim", rejectUnverifiedDenial: true,
      lines: ["PLAYER-REFERENCED PREGNANCY: The player has mentioned an expected baby. The current context alone does not establish a canonical pregnancy event. Do not make an unsupported definitive claim that the character is NOT pregnant, and do not invent a positive result. Address the practical discussion without abruptly rewriting the storyline."],
    };
  }
  return { source: "none", rejectUnverifiedDenial: false, lines: [] };
}
