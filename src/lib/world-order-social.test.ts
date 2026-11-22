import { describe, expect, it } from "vitest";
import { addCommentToPost, appendMissingReactions, socialReactionWave } from "./world-order-social";

describe("World Order social network", () => {
  it("reacts to the rescue with distinct voices instead of WorldWire clones", () => {
    const posts = socialReactionWave("rescue", 2, { tone: "care" });
    expect(posts.length).toBeGreaterThanOrEqual(6);
    expect(new Set(posts.map(p => p.author)).size).toBe(posts.length);
    expect(posts.some(p => p.author === "Marissa Cole" && p.body.includes("cameras"))).toBe(true);
    expect(posts.some(p => p.category === "Press")).toBe(true);
    expect(posts.some(p => p.category === "Opinion")).toBe(true);
    expect(posts.every(p => p.author !== "WorldWire")).toBe(true);
    expect(posts.some(p => (p.comments?.length ?? 0) > 0)).toBe(true);
    expect(posts.every(p => (p.likes ?? 0) > 0)).toBe(true);
  });
  it("varies the reaction wave by the player's rescue choice", () => {
    const care = socialReactionWave("rescue", 2, { tone: "care" });
    const publicity = socialReactionWave("rescue", 2, { tone: "leadership" });
    expect(care.map(p => p.body)).not.toEqual(publicity.map(p => p.body));
  });
  it("avoids duplicate reactions when upgrading browser saves", () => {
    const wave = socialReactionWave("rescue", 2, { tone: "care" });
    expect(appendMissingReactions(wave, wave)).toEqual(wave);
  });
  it("adds comments while retaining earlier posts and engagement", () => {
    const posts = socialReactionWave("interview", 3);
    const first = posts[0]!;
    const added = addCommentToPost(posts, first.id, "You", "That is an interesting point.", 3);
    expect(added[0]?.comments?.at(-1)?.body).toBe("That is an interesting point.");
    expect(added[0]?.likes).toBe(first.likes);
    expect(added[1]).toEqual(posts[1]);
  });
  it("does not add blank or oversize comments", () => {
    const posts = socialReactionWave("cuba", 4);
    expect(addCommentToPost(posts, posts[0]!.id, "You", " ", 4)).toBe(posts);
    expect(addCommentToPost(posts, posts[0]!.id, "You", "x".repeat(351), 4)).toBe(posts);
  });
  it("Cuba reactions reflect the player's route", () => {
    const reform = socialReactionWave("cuba", 4, { route: "reform" });
    const investment = socialReactionWave("cuba", 4, { route: "investment" });
    expect(reform[0]?.body).not.toBe(investment[0]?.body);
  });
});
