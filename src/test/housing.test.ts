import { it, expect } from "vitest";
import { housingCommuteMinutes, housingInputSchema } from "@/lib/housing";
import { mentionedHome } from "@/lib/residential-calendar.server";
import { initialScene, transitionScene } from "@/lib/experience-scene";
it("resolves home pronouns per speaker and rejects client actor impersonation", () => {
  const homes = { user: "residence:player", character: "residence:tess" };
  expect(mentionedHome("Dinner at my place?", "user", homes)).toBe(homes.user);
  expect(mentionedHome("Dinner at my place?", "character", homes)).toBe(homes.character);
  expect(mentionedHome("Dinner at your home?", "character", homes)).toBe(homes.user);
  expect(
    housingInputSchema.parse({
      command: "respond",
      actor: "tess",
      payload: { proposalId: crypto.randomUUID(), version: 0, accept: true },
    }),
  ).not.toHaveProperty("actor");
});
it("keeps a moved home authoritative through dinner, movies and a return trip", () => {
  const homes = { user: "residence:player", character: "residence:tess" };
  let scene = initialScene("tess", homes.user, "My Home");
  scene = transitionScene(scene, "I start cooking dinner.", "tess", "Tess", homes)!;
  expect(scene.activity).toBe("cooking");
  scene = transitionScene(scene, "We watch a movie.", "tess", "Tess", homes)!;
  expect(scene.activity).toBe("watching_movie");
  scene = transitionScene(scene, "I drive you home.", "tess", "Tess", homes)!;
  expect(scene.destinationKey).toBe(homes.character);
  scene = transitionScene(scene, "We arrive at your front door.", "tess", "Tess", homes)!;
  expect(scene.locationKey).toBe(homes.character);
  expect(scene.area).toContain("outside");
  expect(transitionScene(scene, "We could cook at my house tomorrow?", "tess", "Tess", homes)).toBe(
    null,
  );
});
it("recalculates approximate commute after a move without inventing an exact employer address", () => {
  const work = { key: "work-area:altoona", latitude: 40.5187, longitude: -78.3947 };
  expect(
    housingCommuteMinutes({ key: "nearby", latitude: 40.52, longitude: -78.395 }, work),
  ).toBeLessThan(
    housingCommuteMinutes({ key: "tyrone-home", latitude: 40.6706, longitude: -78.2386 }, work),
  );
});
