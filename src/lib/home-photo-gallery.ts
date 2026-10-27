/** Only delivered character photos with explicit at-home provenance are eligible. */
export type HomePhotoCandidate = {
  id: string;
  body: string;
  created_at: string;
  metadata: unknown;
};
export function verifiedHomePhotoCandidates(rows: readonly HomePhotoCandidate[], character: string) {
  return rows.flatMap(row => {
    const m = row.metadata as {
      generated_path?: unknown;
      photo_visual?: { character?: unknown; location?: unknown };
    } | null;
    // "home" is the existing photography location type, not a specific address.
    // Never attach these to a player's or unrelated person's residence.
    if (!m || typeof m.generated_path !== "string" ||
      m.photo_visual?.character !== character ||
      m.photo_visual?.location !== "home" ||
      !m.generated_path.includes("/") || m.generated_path.startsWith("/")) return [];
    if (m.generated_path.includes("..") || m.generated_path.includes("\\") || /[?#]/.test(m.generated_path)) return [];
    return [{
      id: row.id,
      path: m.generated_path,
      caption: row.body.slice(0, 180),
      createdAt: row.created_at,
    }];
  });
}
