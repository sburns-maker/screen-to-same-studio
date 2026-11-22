/**
 * Social activity in World Order. All named posters here are original fictional
 * characters. Public figures are only referenced as subjects of the alternate-
 * history game; this module does not invent their social-media statements.
 */
export type SocialPost = {
  id: number; author: string; body: string; day: number; category: string;
  handle?: string; likes?: number; reposts?: number; comments?: SocialComment[];
  liked?: boolean;
};
export type SocialComment = {
  id: number; author: string; body: string; likes: number;
};
export type SocialMoment = "rescue" | "interview" | "cuba" | "status";
export type SocialTone = "care" | "courage" | "leadership" | "evidence";
export type SocialRoute = "undecided" | "reform" | "investment" | "diplomacy";

type Reaction = { author: string; handle: string; category: string; body: string; likes: number; reposts: number; comments: [string, string][] };
const reactions: Record<Exclude<SocialMoment, "status">, Reaction[]> = {
  rescue: [
    { author: "Jules Moreno", handle: "@julesatshows", category: "Eyewitness", body: "I WAS THERE. The music stopped, people started screaming, and someone from the crowd jumped in to help. Still shaking.", likes: 184200, reposts: 31800, comments: [["Marissa Cole", "Please tell me everyone is okay."], ["Theo Park", "Saw three different angles. Unreal."]] },
    { author: "Maya Torres", handle: "@mayatorres", category: "Entertainment", body: "The concert footage is everywhere. Let's remember there were frightened people in that venue, not just a viral clip.", likes: 92800, reposts: 12400, comments: [["Nora Wells", "That part is getting lost in the coverage."], ["Carmen Lee", "Thank you for saying this."]] },
    { author: "Stanley Ortiz", handle: "@stanreviews", category: "Fans", body: "The way that stranger didn't hesitate when security was trying to reach the stage?? I have watched the video five times.", likes: 306000, reposts: 42700, comments: [["Tess Nguyen", "Literally my entire timeline right now."], ["Ari Benson", "Imagine being at THAT show."]] },
    { author: "Carmen Lee", handle: "@carmenlee", category: "Community", body: "Everyone's calling this person a hero, but I hope they're getting a chance to process what happened too.", likes: 57000, reposts: 6800, comments: [["Jules Moreno", "The crowd was terrifying for a minute."], ["Marissa Cole", "Being brave doesn't mean you're not scared."]] },
    { author: "Nora Wells", handle: "@norawells", category: "Press", body: "Officials are expected to review the concert security response. There are still significant unanswered questions.", likes: 46200, reposts: 7900, comments: [["Ravi Mehta", "Please report facts instead of rumors."], ["Maya Torres", "Agreed."]] },
    { author: "Ravi Mehta", handle: "@ravimehta", category: "Opinion", body: "I admire what happened, but can people stop trying to turn one dramatic night into a national political movement?", likes: 33700, reposts: 4900, comments: [["Stanley Ortiz", "Let us appreciate someone helping for five minutes."], ["Carmen Lee", "Both can be true."]] },
  ],
  interview: [
    { author: "Maya Torres", handle: "@mayatorres", category: "Entertainment", body: "That interview started as a story about surviving a concert and somehow ended as the biggest political moment of the week.", likes: 212000, reposts: 37500, comments: [["Jules Moreno", "We are living in a bizarre timeline."], ["Nora Wells", "The response from the administration will matter."]] },
    { author: "Nora Wells", handle: "@norawells", category: "Politics", body: "The president is facing fresh questions after tonight's televised exchange. The public deserves answers, not just clips.", likes: 141000, reposts: 22100, comments: [["Ravi Mehta", "Exactly. Put the full context out."], ["Maya Torres", "Working on the full transcript."]] },
    { author: "Jules Moreno", handle: "@julesatshows", category: "Fans", body: "One week you're at a concert and next thing you're roasting the president on TV? What even IS this timeline 😭", likes: 381000, reposts: 66000, comments: [["Stanley Ortiz", "Main character energy is getting out of control."], ["Carmen Lee", "I need to put my phone down."]] },
    { author: "Ravi Mehta", handle: "@ravimehta", category: "Opinion", body: "Viral moments are fun. Governing takes more than charisma. Let's see whether any of this turns into actual policy.", likes: 43800, reposts: 8200, comments: [["Nora Wells", "A fair point."], ["Stanley Ortiz", "Or maybe let the guy talk?"]] },
    { author: "Sofía Reyes", handle: "@sofiareports", category: "World", body: "Meanwhile in Havana, residents are organizing around reforms. Our future deserves more attention than an American TV clip.", likes: 54800, reposts: 11200, comments: [["Elena Valdés", "Absolutely. Local voices first."], ["Lucía Herrera", "We need concrete solutions."]] },
  ],
  cuba: [
    { author: "Sofía Reyes", handle: "@sofiareports", category: "Havana", body: "People here have different views on the transition. One thing nearly everyone agrees on: decisions about Cuba must involve Cubans.", likes: 48500, reposts: 10400, comments: [["Elena Valdés", "Exactly."], ["Rafael Morales", "We need real commitments."]] },
    { author: "Lucía Herrera", handle: "@luciaherrera", category: "Business", body: "I don't care how famous the visitors are. Tell us what happens to jobs, small businesses, and families.", likes: 31700, reposts: 6400, comments: [["Rafael Morales", "Workers need a seat at the table."], ["Sofía Reyes", "I'll ask that question."]] },
    { author: "Rafael Morales", handle: "@rafael_havana", category: "Community", body: "A new leader is not a substitute for accountable institutions. My neighbors want electricity and security, not slogans.", likes: 28200, reposts: 5700, comments: [["Lucía Herrera", "And functioning shops."], ["Elena Valdés", "We hear you."]] },
    { author: "Daniel Mercer", handle: "@mercercapital", category: "Business", body: "There is real reconstruction potential, but no serious investment happens without transparent rules and trust.", likes: 17900, reposts: 2600, comments: [["Lucía Herrera", "Local ownership matters."], ["Ravi Mehta", "Who's writing those rules?"]] },
  ],
};

const careSpotlight: Reaction = {
  author: "Marissa Cole", handle: "@marissacole", category: "Culture",
  body: "Something about that clip where the rescuer turns away from all the cameras and checks on Sabrina instead. That feels more important than the follower count.",
  likes: 267000, reposts: 36000,
  comments: [["Jules Moreno", "I was there. It really happened like that."], ["Carmen Lee", "Exactly. The human part."]],
};
const publicitySpotlight: Reaction = {
  author: "Theo Park", handle: "@theopark", category: "Trending",
  body: "The guy who helped at Sabrina's concert just spoke directly to the cameras. This story is getting even bigger.",
  likes: 309000, reposts: 48500,
  comments: [["Ravi Mehta", "Let's not confuse fame with qualifications."], ["Stanley Ortiz", "The clip is everywhere."]],
};
const evidenceSpotlight: Reaction = {
  author: "Nora Wells", handle: "@norawells", category: "Press",
  body: "Investigators say they are collecting witness accounts from the concert. Responsible reporting matters more than instant theories.",
  likes: 88300, reposts: 14600,
  comments: [["Maya Torres", "Please keep reminding people."], ["Carmen Lee", "Thank you."]],
};

const hash = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
};
function postFromReaction(reaction: Reaction, day: number, salt: string): SocialPost {
  const id = hash(salt + ":" + day + ":" + reaction.handle);
  return {
    id, author: reaction.author, handle: reaction.handle, category: reaction.category, day,
    body: reaction.body, likes: reaction.likes, reposts: reaction.reposts,
    comments: reaction.comments.map(([author, body], i) => ({ id: hash(id + ":" + i), author, body, likes: 90 + i * 131 })),
  };
}

/** Generates stable, diverse social posts. A long news report remains a separate item. */
export function socialReactionWave(moment: SocialMoment, day: number, opts: {
  tone?: SocialTone; route?: SocialRoute; seed?: string;
} = {}): SocialPost[] {
  if (moment === "status") return [];
  const core = reactions[moment];
  const picked = [...core];
  if (moment === "rescue") {
    picked.splice(2, 0, opts.tone === "leadership" ? publicitySpotlight : opts.tone === "evidence" ? evidenceSpotlight : careSpotlight);
  }
  if (moment === "cuba" && opts.route && opts.route !== "undecided") {
    const messages: Record<Exclude<SocialRoute, "undecided">, string> = {
      reform: "The incoming reform coalition says it will hold open meetings. I'm watching whether ordinary residents actually get to speak.",
      investment: "Foreign investment is on the table. Let's make sure the benefits reach people doing the work.",
      diplomacy: "Negotiators are meeting again. We need a transparent process, not just smiling leaders and handshakes.",
    };
    picked.unshift({
      author: "Elena Valdés", handle: "@elenavaldes", category: "Cuba",
      body: messages[opts.route], likes: 22900, reposts: 4900,
      comments: [["Sofía Reyes", "I'll be asking the questions."], ["Rafael Morales", "We'll hold everyone accountable."]],
    });
  }
  return picked.map(r => postFromReaction(r, day, moment + ":" + (opts.seed ?? "")));
}
/** Upgrades existing saves without overwriting posts or reactions already made. */
export function appendMissingReactions(posts: SocialPost[], added: SocialPost[]): SocialPost[] {
  const ids = new Set(posts.map(p => p.id));
  return [...added.filter(p => !ids.has(p.id)), ...posts].slice(0, 160);
}
export function addCommentToPost(posts: SocialPost[], postId: number, author: string, body: string, day: number): SocialPost[] {
  if (!body.trim() || body.length > 350) return posts;
  return posts.map(p => p.id === postId ? { ...p, comments: [...(p.comments ?? []),
    { id: hash(postId + ":" + day + ":" + (p.comments?.length ?? 0) + ":" + body), author, body: body.trim(), likes: 0 }] } : p);
}
