import evening from "@/assets/references/brooke/evening.jpg?inline";
import { decodePortrait } from "./profile-media.server";

/** Original owner-supplied bytes, server-only; never auto-imported or approved. */
export function brookeEveningReference() {
  const prefix = "data:image/jpeg;base64,";
  if (!evening.startsWith(prefix)) throw new Error("Brooke evening reference unavailable");
  const encoded = evening.slice(prefix.length);
  decodePortrait(encoded);
  return encoded;
}