/** Only these player actions may change a handoff. Recipient receipt is never player-asserted. */
export type GiftStatus = "attempted" | "waiting" | "returned" | "received";
export function nextGiftStatus(current: GiftStatus, action: "wait" | "take_back"): GiftStatus {
  if (current === "returned" || current === "received") return current;
  return action === "take_back" ? "returned" : "waiting";
}
export function giftReceiptConfirmed(status: GiftStatus): false {
  void status;
  return false;
}

/** Conservative character first-person acknowledgment, tied to the actual item.
 * No user-authored messages, future promises or vague thanks qualify. */
export function explicitReceiptEvidence(body: string, item: string): boolean {
  const text=body.toLowerCase().replace(/[’]/g,"'");
  if (/\b(?:didn.t|did not|haven.t|have not|never|not yet|if|when|would|could|might|hope|wish)\b/.test(text)) return false;
  if (!/\b(?:i (?:got|received|picked up|ate|drank)|it (?:got|was) (?:delivered|here)|the (?:lunch|food|coffee|gift|package|flowers) (?:arrived|is here))\b/.test(text)) return false;
  const words=item.toLowerCase().match(/[a-z]{4,}/g)??[];
  const distinctive=words.filter(w=>!["some","with","from","that","this","have","just","packed","drink"].includes(w));
  return distinctive.length>0 && distinctive.some(word=>text.includes(word));
}
