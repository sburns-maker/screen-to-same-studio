# Phase 6 — Living Experiences

Implemented on `feature/phase6-living-experiences`, continuing draft PR #33. No production migrations, merge, deployment, or paid provider calls were performed during development.

## Architecture review and implementation

The published foundation provided a journal, row-locked claim/pause/resume and a local lifecycle test. It did not invoke a character, run off-screen simulation, or reconcile completion. Its unrestricted service completion RPC could bypass final reconciliation, and the older calendar processor could mark plans missed before the claim window closed. Migration 0025 was also missing from the migration journal.

Migration **0026_complete_living_experiences** extends 0025 without rewriting it. The migration journal now registers both. It adds generation reservations, transition receipts, feature settings and ownership guards. Unclaimed reschedules move the same experience window while preserving its chosen duration; cancelled plans cannot be simulated. No historic plans are automatically backfilled: only confirmed, venue-linked primary-character conversation plans scheduled on or after the installation timestamp qualify. Existing Phase 6 rows are preserved. Legacy multi-participant gatherings continue to use their existing engine; this release supports one primary companion (Tess, Maya, Claire, Jordan or Ben), including ordinary platonic activities.

The experience channel calls the **same `generateTessReply` / `generateContactReply` functions**, character bibles, structured schema, model, voice enforcement, scoped memory recall, own-character knowledge, storyline, continuity and calendar context as texting. Channel instructions allow concise narration, gestures and spoken dialogue. Recorded user contributions are untrusted evidence in the input, not system instructions. The fictional clock starts at the scheduled appointment; opening late never establishes a stand-up. Images, videos, canonical references, SMS and calls are not reimplemented or redirected.

In-person moments live in their own journal, never in the SMS messages table. Proposed memories and relationship deltas do not become history during a turn. One bounded aggregate from actual interactive turns is applied at final completion, against the then-current relationship state, with difficulty sanitization, diminishing positive gains and Ben's platonic restrictions. Automatic attendance earns zero relationship change. New plans or intimate milestones are not inferred from absent-user consent.

`experience_command` locks the calendar, plan and experience in that order. Claim ownership is indefinite; no browser timer, lease or refresh releases an interactive/paused claim. Generation reservations have a two-minute lease and fresh fencing token. A retry preserves the original contribution; concurrent or stale results cannot commit. Transition receipts and completed-operation receipts make repeated request IDs safe. At most three attempts per generation operation; uncertain text requests may have incurred charges. There is no image-generation retry in this feature.

Completion commits the final scene, canonical outcome, plan status, transition, one memory, one shared-world event with participant records (user participation only for interactive mode), own-character knowledge and bounded relationship adjustment in **one transaction**. Any reconciliation failure rolls everything back. `synced_at` is the transaction receipt. Old calendar/departure batch processors skip protected outings; the plan trigger rejects incompatible writes from other paths. Explicit travel away can still update virtual travel, but cannot finish or overwrite an interactive date.

## User experience

Plans and matching venues link to `/experiences?plan=<plan-id>`. The screen provides:

- Character's current approved display portrait, venue and Eastern appointment time.
- Default four-hour start window, adjustable per unclaimed outing to 1–24 elapsed hours. UTC instants preserve correct behavior across DST.
- Experience this outing (claims and opens with a character response); recovery Begin scene; free-text Continue; Pause; Resume Experience.
- Finish experience: close now and summarize recorded moments only.
- Finish remaining portion automatically: preserve the played history and simulate only a modest remainder.
- Skip & Simulate: explicit off-screen completion after the scheduled start.
- A durable pending-scene retry after refresh or provider failure, using the original operation ID.
- Separate user/character/closing moments and the final outcome.

Existing navigation is preserved. No new move-by-move game, mandatory romance, real GPS, photos, or generated user dialogue was introduced. The screen uses responsive layouts, standard Android-compatible inputs and at least 44px action targets. Closing the browser has no lifecycle effect.

## Offline worker and limits

The existing leased `runWorldTickWithAdmin` invokes experience processing before calendar progression. It needs no open tab. It respects the run's pause/AI budget, shared per-user `reserve_world_ai`, and existing text-provider safeguards. Each user gets at most one selected experience generation per tick. Practice-mode conversations are excluded from automatic processing; explicit interaction/simulation remains available. Candidate selection filters exhausted, still-leased and Practice-mode records in PostgreSQL before selecting one, so they cannot permanently block another outing. Failed claims remain recoverable, not falsely completed.

Additional bounds: 40 new experience generation operations per user per UTC day, three attempts per operation, 80 operations per outing, and a roughly 50,000-character played-scene budget. The scene-budget limit offers completion while retaining the entire journal for reconciliation. Ancillary prompt sections are bounded, and the full played journal is supplied to final generation. No recurring image, video or voice costs are enabled. Costs are one normal configured character-text inference per scene/closing generation, plus any explicitly bounded text retry; no provider/model changes.

Developer-authorized Simulation Debug exposes experience/plan IDs, character/venue, moment count, times, state, owner, revision, background eligibility, failure and canonical synchronization receipt. Developer access uses the existing photo-tool flag and user allowlist; ordinary users cannot query another user's records or invoke service-only RPCs.

## Validation

The automated suite mocks paid AI calls; it does not establish live model quality, scheduler configuration, or Android device behavior. Disposable PGlite PostgreSQL tests exercise actual migrations and server services. A separate PostgreSQL 17 container test uses multiple independent connections and server lock-table evidence to prove competing claims, one-time concurrent completion, rollback and RLS/service-RPC isolation. CI runs that suite using a disposable PostgreSQL service, without production credentials.

Run locally:

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
```

For the multi-connection tests, create a **fresh disposable local** database named `phase6_tests`; never point this variable at a production server:

```sh
PHASE6_TEST_DATABASE_URL=postgres://postgres:LOCAL_TEST_PASSWORD@127.0.0.1:5432/phase6_tests \
  npx vitest run src/test/experience-postgres.test.ts
```

The test refuses a non-local host or a database name other than `phase6_tests`, and creates its schemas itself. Ordinary `npm test` skips this opt-in suite; it was also run separately during implementation. Repeat using a fresh database. All provider tests are mocked.

The repository-wide lint command has thousands of **pre-existing Prettier formatting errors** (3,602 errors on the original PR head); formatting the entire unrelated application is intentionally outside this feature. New modules are formatted, and changed modules receive functional ESLint checks with that formatting rule disabled. See PR validation results for final counts.

### GitHub check setup correction

The initial PostgreSQL workflow incorrectly configured npm lockfile caching and `npm ci`, although this application commits `bun.lock` and no npm lockfile. A fresh `npm ci --dry-run` reproduced the installation failure. The app's Bun lock also contains private Lovable package-mirror URLs, so the SQL-only job now installs only `vitest@4.1.11` and `postgres@3.4.9` (their existing lockfile versions) into the runner's temporary directory. It uses `vitest.postgres.config.ts`, without application React plugins or browser test setup. The app manifest and Bun lock are unchanged.

The corrected job was reproduced in a clean directory with freshly downloaded public test dependencies, Node **22.23.4**, a fresh PostgreSQL **17** database and all SQL migrations: **5 tests passed**. The dedicated config also passes ESLint. This verifies the local workflow reproduction; the next GitHub run must still turn green before merging. GitHub's API was unavailable from this workspace, so hosted-run logs/status could not be independently verified. No production migrations or application changes are involved in this correction.

### Final local results

- `npm test`: **550 passed**, 5 opt-in PostgreSQL tests skipped in the ordinary run (60 passing test files).
- Separate fresh PostgreSQL 17 run, applying **every SQL migration in order**: **5 passed**, including both claim races, duplicate completion, transactional rollback and cross-user/RPC isolation.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; existing PWA asset-glob warnings remain non-fatal.
- Focused ESLint/formatting for new Phase 6 modules: passed. Functional ESLint for changed existing modules (Prettier rule disabled): passed.
- `npm run lint`: not green; 3,503 formatting errors and 6 warnings in the latest repository run. The original PR head had 3,602 errors and 7 warnings. This is existing repository formatting debt; the feature does not claim a clean full-repository lint result.
- `git diff --check`: passed.
- Tests used fictional records, mocked paid providers and local disposable databases. No real histories, production data or paid generations were used.

The latest main-branch clinic-context update was merged **into this feature branch**. Its newly introduced failing test exposed an over-escaped date pattern that produced `NaN`/`undefined` daily details; the date seed and modulo variation were repaired and the full suite rerun successfully.

Primary changed files: `living-experiences.server.ts` (shared-brain adapter, worker and scoped reads), `living-experiences.functions.ts` (authenticated actions/diagnostics), `living-experiences.ts` (channel/clock contracts), `experiences.tsx` (mobile scene UI), `ExperienceEntry.tsx`, `LivingExperiencesDebug.tsx`, `use-experiences.ts`, Plans/venue/debug integration, `tess.server.ts` (optional channel override), `world.server.ts` (leased worker integration), migration 0026/journal/types, the PostgreSQL CI workflow and Phase 6 tests. Existing migration 0025 is unchanged. All changed files can be reviewed in PR #33's Files changed tab.

## Lovable configuration and activation — no SSH required

These are instructions for the owner **after reviewing and approving PR #33**, not actions already taken:

1. Merge PR #33 in GitHub when ready. Open the connected Lovable project and confirm it has synchronized the merged source. Do not publish yet.
2. Ask Lovable to review and apply pending migrations **0025 and 0026**, in order, using its backend migration tooling. Skip 0025 if already recorded as applied. If it was applied manually before its journal entry existed, verify its tables/RPCs and reconcile the migration ledger through the existing tooling rather than rerunning CREATE TABLE statements. Do not paste/execute 0025 a second time, reset tables, or regenerate the schema.
3. In Lovable Cloud server secrets, keep the existing `OPENAI_API_KEY`, Supabase URL/service-role secret and current character model configuration. Add `LIVING_EXPERIENCES_ENABLED=true`. No new paid provider is needed. Never use a frontend `VITE_` key.
4. Ask Lovable to enable the reviewed database feature switch with:
   ```sql
   UPDATE public.experience_settings SET enabled=true WHERE singleton=true;
   SELECT public.experience_status(); -- 26 when enabled
   ```
   Both the server flag and database switch are required. The migration defaults disabled. A global default window can be changed with `window_hours` (1–24); individual unclaimed windows can be changed in the experience screen.
5. Verify the existing GitHub **Living World** scheduled workflow: repository variable `LIVING_WORLD_ENABLED=true`, `WORLD_TICK_URL=https://YOUR_APP/api/public/jobs/world-tick`, and GitHub secret `LOVABLE_CRON_SECRET` matching the server secret. It runs every five minutes, subject to GitHub scheduling delay. Existing worker authentication/lease configuration remains required. Do not treat a local test as proof that this production workflow is enabled.
6. In a review environment, confirm an ordinary future outing with one character, time and a registered venue. In Plans choose Experience this outing, Begin scene, type a genuine line, pause, refresh, resume, then finish. Check that SMS history did not gain in-person messages and that Plans, memory and diagnostics show one completed outcome.
7. Test a second outing with Skip & Simulate, then an untouched outing whose start window expires while the tab is closed. Confirm the scheduled workflow log and one canonical outcome. Test a paused outing across another tick: it must remain paused.
8. On actual Android Chrome and the installed PWA, check keyboard scrolling, action targets, back navigation, reload and another-device resume. Then manually publish only after these acceptance checks pass.

Suggested Lovable prompt:

> Review the merged Phase 6 code and apply only pending additive migrations 0025_living_experiences and 0026_complete_living_experiences in order. Preserve all data. Verify experience_status and enable experience_settings.enabled only in the review environment after the migration succeeds. Ensure LIVING_EXPERIENCES_ENABLED is a server secret. Validate a played, paused/resumed and automatically finished outing and the existing authenticated world-tick workflow. Do not publish or reset data.

## Remaining live checks and boundaries

No live paid character dialogue, real Android/PWA device, production scheduler or production migration was tested. A conservative text guard rejects obvious invented off-screen intimacy/user speech, but is not a semantic truth verifier. Personality, consent and factual-generation quality still need review with real responses; a prompt policy cannot guarantee flawless model behavior. Provider output is never evidence of live deployment success. Multi-companion scenes, NPC companions without the primary character engine, new-plan extraction from scene dialogue, and photos during an experience remain outside this release; existing photo/video/SMS/call functionality is preserved. Existing commitments remain context, and the linked outing is reconciled at completion. A reservation exhausting three failures needs developer inspection; do not clear interactive ownership to make the worker take over. Disabling a feature switch does not release existing interactive claims.
