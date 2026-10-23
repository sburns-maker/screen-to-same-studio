import { describe, it, expect } from "vitest";
import { matchesPlace, searchPlace, placeTravelMinutes } from "@/lib/place-discovery";
import { TOWN_PLACES, TOWN_NPCS } from "@/lib/town";
import { PLACE_REGISTRY } from "@/lib/place-registry";
import { EXPERIENCE_TEMPLATES } from "@/lib/venue-experiences";
import { recognizePlan } from "@/lib/calendar-logic";
describe("public place discovery and context", () => {
  it("filters activities without omitting gardens or bookshops", () => {
    expect(matchesPlace("garden", "park")).toBe(true);
    expect(matchesPlace("bookshop", "library")).toBe(true);
    expect(matchesPlace("bar", "cafe")).toBe(false);
    expect(matchesPlace("bar", "bar")).toBe(true);
  });
  it("searches by community and avoids claiming a GPS route from an unknown virtual origin", () => {
    expect(
      searchPlace(
        TOWN_PLACES.find((p) => p.key === "park:willow")!,
        "duncansville",
      ),
    ).toBe(true);
    expect(placeTravelMinutes(null, "park:willow")).toBeNull();
    expect(placeTravelMinutes("coffee:local", "coffee:local")).toBe(0);
    expect(placeTravelMinutes("coffee:local", "park:willow")).toBeGreaterThan(0);
  });
  it("keeps stable original IDs and meaningful activities at every new place", () => {
    expect(new Set(TOWN_PLACES.map((p) => p.key)).size).toBe(TOWN_PLACES.length);
    expect(PLACE_REGISTRY.every((p) => p.activities.length > 0)).toBe(true);
    expect(
      PLACE_REGISTRY.find((p) => p.key === "trivia:foundry")!.experience_templates,
    ).toHaveProperty("trivia");
    expect(TOWN_NPCS.every((p) => p.age >= 18)).toBe(true);
  });
  it("recognizes a non-romantic trivia invitation through the existing meetup lifecycle", () => {
    expect(
      recognizePlan(
        {
          id: "m",
          conversation_id: "c",
          character_key: "jordan",
          created_at: "2026-10-23T14:00:00Z",
          sender: "tess",
          body: "Want to play trivia at Foundry Table Friday at 7 PM?",
        },
        [],
        null,
      ),
    ).toMatchObject({
      action: "invite",
      category: "meetup",
      title: "Trivia night",
      place: "trivia:foundry",
      time: "19:00",
    });
  });
  it("defines bounded trivia rounds and discussion choices without fake attendee dialogue", () => {
    expect(EXPERIENCE_TEMPLATES.trivia.steps).toHaveLength(3);
    expect(EXPERIENCE_TEMPLATES.book_club.steps.every((s) => s.choices.length === 3)).toBe(true);
  });
});
