# Travel feature rollout

This feature is fictional. It does not buy tickets, make reservations, track real passenger travel, or charge payment methods.

## Merge sequence
1. Merge PR #51 (travel goals and Tess's Iceland canon).
2. Rebase PR #52 onto main, resolve any conflicts, and wait for all checks to pass.
3. In the production Supabase SQL Editor, apply `docs/sql/20261024_travel_trips.sql` exactly once. Verify both `travel_trips` and `travel_trip_moments` and the RLS policies exist.
4. Deploy the server and frontend from the merged commit. Do not assume merging updates Lovable's published app; verify the build version and republish if required.
5. Open Plans → Travel and save Iceland in winter. Set dates, add an itinerary stop, create a separate test trip, invite a character, and verify the server-side result.
6. Start a trip, generate an AI scene, refresh the page and confirm it remains in the saved journal. Mark a stop complete and then finish the trip.
7. With the trip in progress, invite and obtain an explicit acceptance from a fictional companion. Trigger several travel-scene turns; confirm that some grounded moments generate canonical-reference photos while others naturally don't. Verify delivered images appear in that companion's Messages, Photos, and in the Travel journal after a reload. Test image-generation failure and budget exhaustion without fake picture messages. Verify the world tick autonomously considers active-day itinerary stops even when Debug is not opened.
8. Complete a shared stop and verify its memory appears in the companion's ordinary conversation context. Make sure unfinished stops cannot be marked as historical shared memories.
9. Test with a second account to verify its trips and journals remain inaccessible to the first account.

## Scope
Implemented: durable owner-isolated trip records; road trip/flight/rail/local modes; vacation/work/family/adventure purposes; trip date editing; character-directed invitation decisions; agent-written interactive trip scenes; saved journal and signed photo links; autonomous event-driven companion photo decisions in the world worker; canonical reference image generation, existing budget guard, normal chat delivery and photo gallery indexing; long-term memory on completed shared stops; itinerary progress; a multi-day Iceland template; Plans link and summaries.

Not implemented: real flight or hotel booking, live flight status, map directions or ETA, geolocation tracking, weather provider integration, transportation costs, per-day date-specific calendar rows, or a mobile notification workflow. These must not be represented as working.

## Operational notes
- Requires the deployed character AI key for scene and invitation generation.
- Invitation status is an in-game AI decision; it is not a real person's consent.
- The automated travel-world-photo worker is bounded per tick but not constrained by a per-character photo cooldown. It only considers unfinished stops on the trip's active date, and requires an accepted fictional companion.
- Existing memories about destinations are not automatically migrated into trip records.
- No itinerary is evidence of real attendance. Stop completion records user-supplied reports.
- If the migration is missing, the Travel page reports a storage error rather than silently losing data.
