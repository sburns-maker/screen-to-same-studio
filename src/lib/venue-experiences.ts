/** Local fictional activities. These are prompts for player choices, never invented character dialogue. */
export const EXPERIENCE_TEMPLATES = {
  book_club: {
    title: "Around the reading table",
    intro:
      "Join a small fictional discussion. Choose what you contribute, or use Talk for your own words.",
    steps: [
      {
        prompt: "What would you like to explore?",
        choices: [
          "A character's difficult decision",
          "How the setting shapes the story",
          "A question the story leaves open",
        ],
      },
      {
        prompt: "How do you contribute?",
        choices: [
          "Offer a different interpretation",
          "Ask the group an open question",
          "Explain why a scene stayed with me",
        ],
      },
      {
        prompt: "How would you close your contribution?",
        choices: [
          "Suggest an angle for next time",
          "Share one last observation",
          "Listen for a while before leaving",
        ],
      },
    ],
  },
  trivia: {
    title: "A few rounds at the table",
    intro:
      "Play a short fictional round as the Window Table team. Only your submitted answers determine your score.",
    steps: [
      {
        prompt: "Which planet has the shortest year?",
        choices: ["Venus", "Mercury", "Mars"],
        answer: 1,
      },
      {
        prompt: "How many sides does a hexagon have?",
        choices: ["Five", "Eight", "Six"],
        answer: 2,
      },
      {
        prompt: "Who wrote Pride and Prejudice?",
        choices: ["Jane Austen", "Mary Shelley", "George Eliot"],
        answer: 0,
      },
    ],
  },
} as const;
export type ExperienceKind = keyof typeof EXPERIENCE_TEMPLATES;
export type ExperienceState = {
  kind: ExperienceKind;
  step: number;
  status: "active" | "completed";
  score: number;
  answers: { prompt: string; choice: string; correct?: boolean }[];
  summary: string;
  plan_id: string | null;
};
export function experienceForPlace(kind: string): ExperienceKind[] {
  return kind === "bar" ? ["trivia"] : ["library", "bookshop"].includes(kind) ? ["book_club"] : [];
}
export function experienceKey(kind: ExperienceKind, plan?: string) {
  return plan ?? `solo:${kind}`;
}
export function experienceSummary(e: ExperienceState) {
  return `${EXPERIENCE_TEMPLATES[e.kind].title}: ${e.status === "completed" ? "finished" : `${e.step} contributions recorded`}${e.kind === "trivia" ? ` · ${e.score}/${e.answers.length} correct` : ""}`;
}
