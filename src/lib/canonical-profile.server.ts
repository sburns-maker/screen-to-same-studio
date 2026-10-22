import { createServerOnlyFn } from "@tanstack/react-start";
// Vite embeds original bytes in the SERVER bundle. No filesystem, URL fetching,
// signed-URL expiry, mutable storage alias or generated-image fallback at runtime.
import tess from "@/assets/tess.jpg?inline";
import maya from "@/assets/avatars/maya.jpg?inline";
import claire from "@/assets/avatars/claire.jpg?inline";
import jordan from "@/assets/avatars/jordan.jpg?inline";
import ben from "@/assets/avatars/ben.jpg?inline";
import { PROFILE_PORTRAITS } from "./character-portraits";
import type { CharacterKey } from "./characters";
const originals: Record<CharacterKey, string> = { tess, maya, claire, jordan, ben };
export function jpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes.length > 4 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216)
    throw new Error("Canonical profile is not a supported JPEG");
  let i = 2;
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 255) throw new Error("Canonical profile JPEG is malformed");
    const marker = bytes[i + 1]!;
    i += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes[i]! * 256 + bytes[i + 1]!;
    if (length < 2 || i + length > bytes.length)
      throw new Error("Canonical profile JPEG is truncated");
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      const height = bytes[i + 3]! * 256 + bytes[i + 4]!,
        width = bytes[i + 5]! * 256 + bytes[i + 6]!;
      if (Math.min(width, height) < 256 || Math.max(width, height) > 8192)
        throw new Error("Canonical profile resolution is insufficient");
      return { width, height };
    }
    i += length;
  }
  throw new Error("Canonical profile dimensions unavailable");
}
export const canonicalProfile = createServerOnlyFn(async (key: CharacterKey) => {
  if (!Object.hasOwn(originals, key)) throw new Error("Canonical profile is not registered");
  const url = originals[key];
  if (!url.startsWith("data:image/jpeg;base64,"))
    throw new Error("Canonical profile bytes unavailable");
  const raw = atob(url.slice(url.indexOf(",") + 1));
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const dimensions = jpegDimensions(bytes);
  const sha = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(sha), (n) => n.toString(16).padStart(2, "0")).join("");
  return {
    blob: new Blob([bytes], { type: "image/jpeg" }),
    asset: PROFILE_PORTRAITS[key].asset,
    sha256: hash,
    ...dimensions,
  };
});
