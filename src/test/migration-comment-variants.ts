// Exact reviewed comment-only variants. Never strip arbitrary SQL comments or string contents.
export const COMMENT_VARIANTS = [
  {
    name: "calendar_event_action",
    signature: "calendar_event_action(uuid,text,uuid,integer,jsonb,timestamp with time zone)",
    original: "41f6a8837c5d0fc38856a0988934bf8a",
    stripped: "71cb35b38c871a4a4e9a220de0fdbb2e",
    comments: [
      "-- An exact acceptance of the current proposal may be carried with a structured character action.",
    ],
  },
  {
    name: "experience_command",
    signature: "experience_command(uuid,uuid,uuid,text,integer,jsonb,timestamp with time zone)",
    original: "2543995560c57835df411f6b3acb5386",
    stripped: "efa4885880070f6eaf88ab80ad197db6",
    comments: [
      "-- A days-late parent completion must not let the worker steal its follow-up immediately.",
      "-- Keep fictional appointment times; grant the user a real four-hour continuation window.",
    ],
  },
];
export function withoutReviewedComments(sql: string, comments: string[]) {
  const lines = sql.split("\n");
  for (const comment of comments) {
    if (lines.filter((line) => line.trim() === comment).length !== 1)
      throw new Error("Expected exactly one reviewed SQL comment line");
  }
  return lines.filter((line) => !comments.includes(line.trim())).join("\n");
}
