/** Only these player actions may change a handoff. Recipient receipt is never player-asserted. */
export type GiftStatus = "attempted" | "waiting" | "returned";
export function nextGiftStatus(current: GiftStatus, action: "wait" | "take_back"): GiftStatus {
  if (current === "returned") return "returned";
  return action === "take_back" ? "returned" : "waiting";
}
export function giftReceiptConfirmed(status: GiftStatus): false {
  void status;
  return false;
}
