import { expect, it } from "vitest";
import { homeInvitationActivity, sameHomeActivity } from "@/lib/calendar-residences";
it.each([
  "Would you like to come to my house for a movie night?",
  "Come over to my place for a film.",
  "I'd love a game night at mine.",
  "How about cooking dinner at my home?",
  "Friday works. My place is fine if you bring snacks",
  "Friday at 7 at my place is still the plan. You can put it down as Claire's home for now",
])("recognizes an actual home invitation: %s", (body) => {
  expect(homeInvitationActivity(body)).not.toBeNull();
});
it.each([
  "I don't want you to come to my house for a movie night.",
  "I never want you to come to my house for a movie.",
  "Maybe we could have a movie night at my house someday.",
  "Remember when we discussed coming to my house for a movie?",
  "You said come over to my house for a movie.",
  "My house has a movie collection.",
  "Come to the cinema for a movie.",
  "I won't host a movie at my house.",
])("does not grant an invitation for %s", (body) => {
  expect(homeInvitationActivity(body)).toBeNull();
});
it("keeps movie invitations distinct from dinner or games", () => {
  expect(sameHomeActivity("Movie night with Claire", "Movie night")).toBe(true);
  expect(sameHomeActivity("Dinner together", "Movie night")).toBe(false);
});
it("does not treat an unrelated 'don't' as refusing Claire's confirmed plan", () => {
  expect(homeInvitationActivity("I don’t have a street address I can send you here, but Friday at 7 at my place is still the plan. You can put it down as Claire’s home for now.")).not.toBeNull();
  expect(sameHomeActivity("Movie night", "Visit at home")).toBe(true);
});
it("treats Tess's 'come cook' reply as a home invitation that covers breakfast", () => {
  const a = homeInvitationActivity("If you want to come cook, you can. I’m still in pajamas, so expectations are very low.");
  expect(a).not.toBeNull();
  expect(sameHomeActivity("Breakfast at Tess's", a!.title)).toBe(true);
  expect(homeInvitationActivity("If you want to come by the bar later, you can.")).toBeNull();
});
