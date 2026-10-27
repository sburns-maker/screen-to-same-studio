import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const hits = [];
function inspect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) inspect(path);
    else if (/\.(?:js|map)$/.test(entry.name)) {
      const text = readFileSync(path, "utf8");
      if (
        ["SPICY_API_KEY", "api.spicyapi.ai", "spicy_photo_reserve", "spicy_photo_finish"].some(
          (marker) => text.includes(marker),
        )
      )
        hits.push(path);
    }
  }
}
inspect(".output/public");
if (hits.length) {
  throw new Error(`Server-only SpicyAPI implementation reached public assets: ${hits.join(", ")}`);
}
console.log("SpicyAPI credentials, API endpoints and job mutations are absent from public assets.");
