# Live scene continuity and consistent photo validation

Based on GitHub/Lovable `main` at `a9ca8e4` (merged calendar repair, PR #69). Work continues on the existing development branch. No production data, migrations, publishing or paid providers were used.

## Findings

The experience prompt repeatedly supplied three current-tense assertions from the original plan: `Attending ... at <original venue>`, `Authoritative outing ... venue <original venue>`, and `You are together ... at <original venue>`. A walk at Juniper Commons therefore remained a strong instruction even when real user journal entries described a restaurant, a car and a front door. There was no separate durable current-scene record. The history reader also stopped at the first 200 moments.

The photo path had a second inconsistency. Preview ran opportunity eligibility without validating the requested location through the delivery location check. Delivery inferred location from a weekly schedule/story and tested the model's generated scene against it. Clear delivered statements such as “I'm home” were dialogue, not a physical-state projection. An old grocery/work/outdoor context could reject a home selfie.

The screenshot revealed two related false positives: “even though there is an unresolved workplace storyline” and “not at any workplace” could be interpreted as current work. A private home could also match the broad `private` activity block. The old world-event formatter labeled every `photo_generation_failure` as a generation request even when validation failed before the image service was called.

## Implemented

### Durable experience scene

Migration **0039_experience_live_scene.sql** adds `live_scene`, `scene_revision`, and a source ordinal to `living_experiences`, plus an owner-scoped transition ledger. The scene tracks location identity/category, activity, outside/front-door area, destination while travelling and the established experience cast.

The server derives meaningful performed transitions from actual user journal entries. Suggestions, questions, hypothetical or remembered travel do not become arrival. A performed action is still recognized if a following sentence asks about the next step. Supported public destinations come from the existing registry; a companion's home is a private fictional alias, with no invented address or GPS access. Arrival at a house does not establish entry or intimacy. The current implementation keeps the existing user + primary-character cast; it does not invent additional participants or unattended conversations.

`experience_scene_apply` requires the service role, matching owner/conversation, an actual confirmed user moment and its exact text, causal ordering and a scene revision. It uses the existing per-user calendar transaction lock. Receipts make retries idempotent. Scene updates do not alter the experience operation revision, relationship scores, calendar venue, title or planned timestamps. Provider failure leaves recorded user transitions intact. Refresh and pause/resume retain the scene.

All experience prompt channels now prioritize the live scene. Calendar metadata is labeled provenance, and the active plan's old location instruction is excluded from current scene context. Old AI narrative cannot redefine the location. A conservative output check withholds clear unsupported returns to a prior venue; it permits memories and ordinary trees/breezes outside a home. No automatic paid regeneration is added.

Journal reads are paged rather than silently losing entries after 200 moments (explicit 5,000-row safety bound). Existing experiences are lazily reconstructed from their real user journal on the next played turn; no historical bulk rewrite is performed. A completed event keeps its original location and receives separate `final_scene` provenance in its existing world-event facts. Existing completion/memory/relationship reconciliation remains authoritative.

The current scene appears in the experience UI and developer diagnostics. Calendar commitment and photo context use the live scene while relevant, rather than the old park venue.

### One photo context and location rule

`resolvePhotoScene` is shared by normal turns, developer preview/delivery, debug and world ticks. It prioritizes an actual live experience, then clear recent first-person location statements from the character's visible messages, then the existing schedule/world context. A service-only RPC maintains a rebuildable `character_scene_state` projection backed by the actual owned message. Preview derives the same result without writing it. Delivery persists available statement evidence before validating a photo.

The four-hour observation lifetime prevents an old “I'm home” from pinning the character there indefinitely. It is a freshness bound, **not a photo cooldown**; only a new real statement refreshes its timestamp. The projection can survive ordinary chatter and reloads. It is not a permanent biography or a new memory store. Existing sleep/busy, privacy and image-policy restrictions still apply.

`photoSceneCheck` supplies the same location classification and failed-rule identifier for preview's requested context and delivery's generated scene. Clear home conversation overrides an old grocery or work photo plan. Grocery objects in a kitchen are not classified as a grocery-store location. Negated work references and abstract stale storyline disclaimers no longer block themselves; real incompatible scenes and sensitive activity restrictions remain.

Developer preview returns the scene version. Delivery compares that version before model/image generation and reports an explicit state change if it differs. The normal provider, canonical identity reference, media storage, delivery outbox, image QC, boundaries, spending limits and retry protection are retained.

A preview cannot examine pixels or a model-generated scene that does not exist yet. The UI now explicitly distinguishes:

- opportunity eligibility and requested-location validation;
- the character's later independent choice;
- validation of the actual model-proposed scene;
- provider/reference/visual-quality checks after generation.

Thus a plain “selfie” can have an unspecified requested location while the actual drafted scene still needs validation. If the model proposes a different location, it is withheld with diagnostics instead of rewriting the caption or fabricating travel. This is not reported as a character refusal.

### Diagnostics and retries

Preview/delivery and recorded world events expose sanitized fields:

- current canonical location and its source;
- inferred requested/generated location;
- failed rule (`photo.location_matches_current_scene` or `photo.preview_scene_version_matches`);
- validation stage;
- whether the image-generation service was requested.

These appear in the Photos debug result and Mind world-event details. Older logs with no request flag are labeled **not recorded**, rather than inventing a charge. An unselected/blocked worker opportunity records that no generation was requested at that step.

A failed delivery's existing ledger remains nonretryable; the same action cannot request another image. An explicit new developer preview creates a new request ID, so the user can deliberately retest corrected context. Nothing automatically regenerates or bypasses budgets. No prompts, API keys or private storage credentials are exposed by these diagnostics.

## Verification and manual acceptance

Automated tests use real SQL and server orchestration with mocked paid providers:

1. Riley: finish a park walk, drive to Valley Table, arrive, order and finish dinner, enter the car, drive home, arrive outside and walk to the front door. Verify persisted scene at each step, unchanged original plan, duplicate-action replay, refresh, pause/resume and final-scene provenance.
2. Reject an obvious AI return to the park without delivering its body or changing relationships; permit an explicit real return transition.
3. Index transitions beyond the old 200-moment cutoff; reject foreign owners, fake source text and stale scene revisions.
4. Tess: grocery-store statement → visible home statement → relaxing at home → preview passes → normal generated image is persisted and delivered. Verify preview makes no image request or location-projection write, and a delivery retry makes no second image request.
5. A changed location after preview stops before generation. A model-drafted clinic image while the canonical scene is home reports both locations and the exact rule, with no image request. Repeating that failed action does not rerun image/text providers.
6. Reproduce the screenshot's weekend/workplace disclaimer and verify eligibility reaches character choice.
7. Real PostgreSQL tests cover concurrent scene-update deduplication, owner isolation, RPC grants and the source-backed photo projection, in addition to existing calendar/experience transaction tests.

Before production activation, review and apply migration 0039 **after** confirming migrations through 0038 and the deployment ledger. Lovable should apply it through its server-side migration workflow; no SSH is needed and no database reset/backfill should be requested. Deploy the reviewed code only after approval. Existing secrets and `LIVING_EXPERIENCES_ENABLED` are unchanged. `experience_scene_status()` should return 39 when checked server-side.

For an existing affected date, resume it and provide an ordinary meaningful contribution; its actual user journal is indexed before the next model prompt. Inspect Current scene and the scene revision in Simulation Debug. Verify that the calendar still says where the outing originally began. Test a home-selfie preview from the Photos developer panel; confirm that both locations say home before deliberately delivering it.

Known limits: deterministic extraction favors clear performed actions and explicit first-person location statements; ambiguous wording does not establish a precise new place. The output check catches clear relocations, not every possible semantic inconsistency. Unsupported phrasing may require clarification. Older databases can derive the prompt context in memory, but durable scene guarantees require migration 0039. Live provider output quality, Android/PWA hardware behavior and production scheduler operation remain manual acceptance checks. No live image was purchased or visually accepted during these automated tests.

## Validation results

- Original feature validation: **776 passed**, with the 9 opt-in PostgreSQL cases skipped in that run.
- Separate disposable PostgreSQL 17 run: **9 passed**, applying every migration through 0039.
- TypeScript checks and production build: passed.
- Focused lint on the new scene/validation modules and tests: passed. Changed existing implementation files also passed functional lint with the repository-wide formatter rule excluded.
- Full repository lint was run and remains red because of existing formatting/type-lint debt; it is not reported as passing. `git diff --check` passed.
- Paid dialogue/image providers were mocked. The grocery/home test uses the actual turn, identity-reference, image persistence and delivery orchestration; this is not a claim that a live photograph was generated or visually approved.

Calendar follow-up invitations remain in the model's context. Only the current parent's old venue instruction is removed; a child's reference to that parent does not remove the child's plan or scheduling information.

## PR #72 conflict resolution

Integrated `main` at `23cb15b` into the existing feature branch without rewriting published history. Kept the newer removal of the broad schedule/storyline opportunity veto; actual requested/generated scenes still use the shared current-scene check and explicit diagnostics. Existing sleep, privacy, consent, identity and spending safeguards remain.

The incoming-callback regression introduced on main used a per-character message sender that violates the existing database constraint. Callback proof now uses the actual shared `tess` transport sender and is scoped to the owned source conversation. The integration test demonstrates a callback from Maya using that real storage contract. No new migration is needed for this merge resolution; migration 0039 remains the feature's required additive migration.

Post-resolution validation: **778 tests passed, 9 opt-in PostgreSQL tests skipped**; TypeScript, production build, focused lint and whitespace validation passed. The earlier separate nine-test PostgreSQL run remains recorded above; it was not repeated for this application-only conflict resolution.
