export const NINA_LEGACY_OPENER = "Okay, important question. Did your team actually know any of those answers Friday or were you all confidently guessing?";

type IntroRow = { id: string; sender: string; body: string; metadata: unknown };

function textOnly(metadata: unknown): boolean {
  const md = metadata as Record<string, unknown> | null;
  return !md?.['generated_path'] && !md?.['photo'] && !md?.['generated_image_id'];
}

/** Only the exact fallback followed by unpaid autonomous text is repairable. */
export function ninaLegacyRepairIds(rows: readonly IntroRow[]): string[] | null {
  const first = rows[0];
  if (!first || first.sender !== "tess" || first.body !== NINA_LEGACY_OPENER || !textOnly(first.metadata)) return null;
  if (rows.slice(1).some(row => {
    const md = row.metadata as Record<string, unknown> | null;
    const decision = md?.['photo_decision'] as Record<string, unknown> | undefined;
    return row.sender !== "tess" || md?.['initiated'] !== true || !textOnly(md)
      || decision?.['generationAttempted'] !== false || decision?.['selectedAction'] !== "text_only";
  })) return null;
  return rows.map(row => row.id);
}