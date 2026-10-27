/** Optional scene-aware starters. Never auto-submit or imply the other character agreed. */
export type ExperienceStarter = { label: string; draft: string };
const COMMON: ExperienceStarter[] = [
  { label: "Keep talking", draft: "I stay with you and keep talking. " },
  { label: "Ask a question", draft: "I look over at you. \"What's on your mind?\"" },
];
const BY_ACTIVITY: Record<string, ExperienceStarter[]> = {
  walking: [
    { label: "Keep walking", draft: "I walk beside you, enjoying the path and our conversation. " },
    { label: "Find a bench", draft: "I gesture toward a nearby bench. \"Want to sit for a little while?\"" },
    { label: "Hold hands", draft: "I reach for your hand as we walk. " },
    { label: "Suggest coffee", draft: "I look over at you. \\"Would you like to stop for coffee after our walk?\\"" },
  ],
  sitting: [
    { label: "Stay and talk", draft: "I sit beside you for a while and enjoy the conversation. " },
    { label: "Enjoy the quiet", draft: "I sit quietly next to you, taking in the park. " },
    { label: "Walk again", draft: "I stand up from the bench and continue walking beside you. " },
  ],
  dining: [
    { label: "Keep chatting", draft: "I smile across the table and continue our conversation. " },
    { label: "Look at the menu", draft: "I look over the menu and ask what sounds good to you. " },
    { label: "Suggest dessert", draft: "I grin. \"Should we look at desserts?\"" },
  ],
  cooking: [
    { label: "Help cook", draft: "I move alongside you to help prepare dinner. " },
    { label: "Ask what next", draft: "I ask, \"What should I do next?\"" },
    { label: "Set the table", draft: "I offer to set the table while we talk. " },
  ],
  watching_movie: [
    { label: "Watch together", draft: "I settle in beside you and watch the movie. " },
    { label: "Talk about it", draft: "I lean over and quietly ask what you think of the movie so far. " },
  ],
  playing_game: [
    { label: "Take my turn", draft: "I take my turn in the game and glance at you with a grin. " },
    { label: "Playfully tease", draft: "I smile. \"You're not going to let me win, are you?\"" },
  ],
  relaxing: [
    { label: "Stay awhile", draft: "I stay beside you, enjoying the quiet. " },
    { label: "Talk", draft: "I turn toward you. \"How are you feeling?\"" },
  ],
};
export function experienceStarters(activity: string | null | undefined): ExperienceStarter[] {
  return BY_ACTIVITY[activity ?? ""] ?? COMMON;
}
