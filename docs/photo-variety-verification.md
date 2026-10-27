# Grounded character photo variety

Ordinary photos keep the existing approved canonical reference. No reference-library
approvals, canonical portraits, provider configuration, budgets, willingness, or safety
rules change. No migration or secret configuration is required.

The turn pipeline reads owner/conversation-scoped visible generated-photo messages
independently of the 40-message dialogue window. Only screened same-character photos
with versioned visual metadata count; up to 20 delivered styles guide the next choice.
Pending images and unapproved assets do not count. Missing history disables photography
for that turn while retaining ordinary text replies.

Clothing carries through travel. An established clothing change releases the prior
outfit, and an overnight work episode can retain its uniform across midnight. Clothing
choices and mood are not rotated to create variety. The existing Eastern local-day
baseline remains; this does not introduce a new wardrobe database or infer unseen changes.

For a missing/repeated capture, a deterministic selector ranks plausible phone framings
against delivered history. It changes camera angle/crop only, keeping the selected mode,
pose, setting, expression, clothes and identity. Explicit composition requests take
precedence. Object photos and group compositions bypass this selector. The final capture
is checked before reserving an image attempt. Identical scene descriptions alone no
longer imply a duplicate; the same uniform or room can produce a different photo.

The approved reference remains the sole ordinary-photo identity anchor. Extra library
references remain confined to their existing provider path. The image generator still
screens identity and scene plausibility and retains existing bounded identity correction.
There is no visual near-duplicate classifier and no extra paid call to rewrite a photo.

Developer photo diagnostics include recentDeliveredCount, captureDecision, final style,
continuity source/reason, and existing scene/provider/reference details. They do not log
private reference URLs or full chat history.

## Automated verification

`src/test/photo-variety.test.ts` runs 20 sequential opportunities for each of the six
characters through real planning, prompt construction and the shared image service with
mocked generation/screening. It verifies unchanged reference bytes/hash, framing diversity,
current context, and within-episode garments/mood. These are contract assertions, not a
claim that generated faces or photographs passed live visual review.

`src/test/photo-turn.test.ts` verifies delivered history outside the dialogue window,
one text call and one image call, and persistence of the selected capture/diagnostics.
Existing photo/provider/privacy/retry tests remain applicable.

## Manual review after deployment

Review 20 opportunities per character across plausible days, not a burst of 20 forced
images in one scene. Respect the existing image budget and character willingness.
Record refusals separately; do not repeatedly retry an uncertain paid action.

1. Four opportunities within a continuous work/break episode.
2. Four spanning travel home, an established clothing change, and a home activity.
3. Four within an established public outing and actual weather/time.
4. Four within another activity, allowing objects/environment and appropriately
   grounded mirror/propped photos. Do not invent a photographer.
5. Four on a later day; for Riley, also test breaks either side of midnight on one shift.

Use existing developer diagnostics and delivered image metadata to compare scene source,
canonical hash, selected capture, outfit, provider/model and action IDs. Visually inspect
recognizable face, hair-color family, phone geometry, expression, framing, clothing and
background. Repeated uniforms are valid; repeated whole compositions are not desirable.
Do not require an expression, outfit or hairstyle change for every opportunity. Reject
unexplained travel, wardrobe changes, invented people and identity drift. Real output
variety remains a manual acceptance check; all automated provider responses are mocked.

## Compatibility with the current home/workplace foundation

The integrated branch also corrects optional/narrowed TypeScript values in home and
workplace controls and uses explicit record indexing for relationship-history reads.
Updated fixtures account for the commitment action contract, six newly registered
workplaces, and Claire's public library role. Town initialization retains its prior
preservation guarantee: newly registered venues are inserted, and existing venue labels
are not overwritten. None of these corrections applies a production migration or changes
saved relationships, consent, residence membership, or conversations.
