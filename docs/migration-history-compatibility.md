# Guarded migration-history recovery (0035–0038)

**Current follow-up:** table default-ACL repair also requires additive migration **0042**. The current normal-runner target is 0042; see the final section below. Earlier recorded results describe prior revisions.

Based on main `7b8ca2f`. This is a source-level compatibility repair, not a manual ledger insertion, blanket no-op or production migration. The user explicitly authorized a code workaround for the permission-blocked migration history. No deployed commit history is rewritten.

## Problem

The reported database has installed effects through 0038 while `drizzle.__drizzle_migrations` ends at 0034. The ordinary runner therefore replays 0035 against the newer delegating experience wrapper and stops. Merely commenting out 0035 is insufficient: 0036/0037 could replace the current calendar contract, and 0038 could fail while recreating existing objects. A new 0042 migration alone cannot help because the runner never gets past 0035.

## Implementation

0035, 0036, 0037 and 0038 now have the same generated compatibility guard (catalog-only validation, with the narrowly scoped permission repair documented below):

- If no 0038 markers exist, execute that file's **original SQL**, preserved byte-for-byte inside its wrapper. This retains fresh installation and normal sequential upgrades, including partially applied older 0035–0037 updates.
- If any 0038 marker exists, require a complete, known implementation before preserving it. A table, status number or unlimited-cap string alone is insufficient.
- Verify twelve function bodies against a reviewed fingerprint manifest, plus their signatures, return types, parameter names/defaults, language, volatility, strictness, parallel mode, security-definer/search-path configuration and anon/authenticated/service execution privileges.
- Verify the added column shapes/defaults, primary/foreign/check constraints, valid index, receipt-table RLS and exact owner policy/privileges, enabled calendar-memory trigger and optional Realtime publication membership.
- Recognize the original 0038 delivery wrapper and the separately reviewed 0041 delivery wrapper. Preserve either during historical replay. Any unknown body/security/schema variation stops with the failed object or function fingerprint, not a private transcript or function body.
- Let the **normal Drizzle migrator** insert its own ledger entries and apply genuinely missing 0039, 0040 and 0041 in the usual transaction. No new grants, sandbox privilege escalation or hand-written ledger repair is introduced.

If an already-recorded database has old hashes for 0035–0038, the standard runner still skips them by their unchanged timestamps. Existing ledger rows are never rewritten. Files 0039–0041 and `_journal.json` are unchanged.

This intentionally changes historical *file contents* to make their execution reentrant; it does not replace them with comments or rewrite Git history. New ledger entries will have the new guarded-file SHA256 hashes. Do not use the earlier four-row SQL snippet's old hashes to describe these changed files. Coordinate any separate staff repair so it does not run concurrently with the normal runner.

The original file SHA256 values are retained in the generator and tested against the embedded SQL payloads. The function fingerprints identify whitespace-normalized known SQL bodies; they are compatibility recognition, not a claim that a hash alone proves arbitrary database safety. Exact schema and permission checks remain mandatory. Formatting-only whitespace changes are tolerated; other unknown revisions require explicit review. A legitimate but different live installation may therefore still stop, with actionable diagnostics.

## Reviewable sources

- `scripts/migration-compat/calendar38-manifest.json`: catalog properties captured from a pristine PostgreSQL 17 installation of the original migrations, with the known 0041 delivery variant.
- `scripts/migration-compat/verify-calendar38.sql`: the common verifier, with an explicit read-only preflight mode.
- `scripts/build-migration-compat.mjs`: deterministic generation, no database connection, secrets or writes to database history. `node scripts/build-migration-compat.mjs --check` verifies generated migrations and preflight stay synchronized with their reviewed source.
- `scripts/migration-compat/preflight.sql`: standalone read-only verification; no DDL, ledger insertion, user-data reads or provider calls. It also works inside a read-only transaction. It reports `known_calendar38_verified`, `known_calendar38_permission_repair_required` or `normal_install_required`, or stops on the precise mismatch.

The generated files repeat the verifier so each migration is self-contained; correctness does not depend on temporary functions, session variables or a runner using the same connection between files. The archived original code executes only on the normal-install path.

## Lovable steps after review and merge

1. Sync the reviewed commit from GitHub. Do not manually edit migration files to comments, change journal timestamps or reset anything.
2. Run the contents of `scripts/migration-compat/preflight.sql` through available backend SQL tooling as a read-only check. If the sandbox cannot inspect the necessary catalog metadata, the normal privileged runner performs the same verification internally.
3. If preflight reports `known_calendar38_permission_repair_required`, it has verified all other properties and identified only the four reviewed anonymous grants below. The normal privileged runner can repair them; the sandbox should not attempt direct DDL. If preflight reports any other mismatch, stop and return the exact object/fingerprint diagnostic. Do not weaken the check, expand the allowlist based only on a status number, or grant the sandbox access to the ledger.
4. With a verified known installation, run the **normal Lovable/Drizzle migration command once**, with no concurrent migration runner. It should preserve installed 0035–0038, record them itself, then apply missing 0039–0042.
5. Verify through the server/migration role: `experience_scene_status() = 39`, `calendar_edit_status() = 40`, and `deliver_photo_turn(uuid)` has the reviewed 0041 behavior for `registered public venue required`. Verify ledger entries through 0042 against the current repository files. These status RPCs intentionally are not general anonymous/browser APIs.
6. Report the installed versions and verify paused outings, saved plans/memories and media references remain present. Do not start, finish or simulate the user's experiences merely to test installation.
7. Do not publish automatically. After migration success, review the normal scene/calendar/photo acceptance checks separately.

If 0039 or 0040 is also partially installed but unrecorded, this workaround deliberately does not guess or skip it: a normal migration failure rolls back catch-up ledger entries and pending changes. Investigate that separate mismatch before proceeding. If the runner refuses all changes to historical migration files as a platform policy, this source workaround cannot override that policy; database-owner intervention remains necessary.

## Verification

The new opt-in PostgreSQL suite invokes the real `drizzle-orm/postgres-js` migrator and its normal file hashing, timestamps, transaction and ledger writes. Only a disposable localhost `/migration_compat_tests` database is accepted; no production credentials are needed. The baseline creates schemas and original 0035–0038 functions without ledger entries after 0034 to reproduce the reported state, then seeds a paused experience, actual journal records, messages, memories, relationship state and a storage reference.

Scenarios include fresh install through 0041; exact drift recovery; unchanged legacy user rows and original ledger rows; repeated normal runner calls; already-recorded historical files; 0035–0037 installed without 0038; already-installed 0041 delivery; read-only preflight; sandbox ledger permission denied followed by successful normal-runner recovery; a single misleading 0038 column; missing function/constraint, changed body, unsafe privilege, disabled RLS/trigger; and full transaction rollback on a later pending migration failure.

Automated SQL tests do not prove that Lovable's live schema matches this known implementation or that its hosted runner accepts the changed files. That must be confirmed by the live preflight/runner result. No production database or paid provider was accessed during this work.

## Recorded results

- Actual Drizzle/PostgreSQL recovery suite: **17 passed** (including restricted sandbox read-only preflight, typed-column mismatch and Realtime membership checks).
- Existing PostgreSQL ownership/concurrency suite with the guarded migration files: **12 passed**.
- Full application suite: **802 passed, 29 opt-in PostgreSQL cases skipped**; those 29 were executed separately as the 17+12 cases above.
- TypeScript, production build, focused ESLint, deterministic generation check and `git diff --check`: passed. Repository-wide existing lint debt is not represented as passing.
- No production execution, deployment, raw ledger inserts or paid model requests were performed.

## Verified comment-stripped installation variant

Lovable's live preflight reported two otherwise unchanged function bodies with specific SQL comment lines removed. Their executable SQL was independently checked against the archived original 0038 payload, without trusting a status number or adding arbitrary reported hashes:

- `calendar_event_action`: removing only `-- An exact acceptance of the current proposal may be carried with a structured character action.` changes the normalized body fingerprint from `41f6a8837c5d0fc38856a0988934bf8a` to `71cb35b38c871a4a4e9a220de0fdbb2e`.
- `experience_command`: removing only the two comments about a days-late parent's follow-up and its real four-hour continuation window changes the fingerprint from `2543995560c57835df411f6b3acb5386` to `efa4885880070f6eaf88ab80ad197db6`.

The manifest accepts only these two additional exact fingerprints. The guard does **not** globally strip comments, relax executable-code matching or change any schema/security/permission check. Original SQL payloads, migration timestamps and executable function logic remain unchanged. The four guarded files and read-only preflight are regenerated from the same verifier/manifest.

The new unit tests derive both hashes directly from the immutable original SQL. The PostgreSQL regression installs those exact comment-stripped function definitions, verifies the read-only preflight, runs the actual Drizzle upgrade through 0041 and checks that the installed function bodies and user history remain intact. A negative case alters an executable ordinal bound in the comment-stripped function and verifies that migration still stops with the ledger at 0034.

After reviewing and merging this follow-up, sync main and rerun the read-only preflight before the normal runner. If another mismatch appears, return its exact diagnostic rather than weakening the checks. Nothing in this follow-up applies production migrations or publishes the app.

Comment-variant follow-up validation: **812 application tests passed** (31 opt-in PostgreSQL cases skipped in that run), and the **19-case actual Drizzle/PostgreSQL compatibility suite passed separately**. TypeScript, production build, focused lint, deterministic generation and whitespace checks passed. The unchanged 12-case external experience transaction suite was not rerun for this narrow manifest follow-up; its earlier results above are historical validation. No live database was accessed.


## Platform-default anonymous function grants (PR #79 follow-up)

The next live report revealed a genuine permission difference, not a body-format variant. The database's default routine ACL explicitly grants EXECUTE to `anon`. Original 0038 revoked anonymous execution on seven public entrypoints but omitted four older/helper functions: `calendar_pending`, `experience_candidates`, `deliver_photo_turn_before_calendar38` and `experience_command_before_calendar38`. Renaming a function preserves its ACL. Revoking PUBLIC alone does not remove a direct grant to anon. This was independently reproduced on disposable PostgreSQL with `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon` before installing the original migrations.

The manifest still requires `anon: false` for all four. A separate, exact signature allowlist identifies only these repairable mismatches. All other body, metadata, effective privileges and schema checks must pass **before any permission change**. The normal privileged runner then revokes only EXECUTE from anon on the affected functions and verifies that effective anonymous access is actually gone. Inherited access that survives revocation aborts the transaction. No permissions are granted; authenticated/service-role privileges, function logic and user records are untouched. Unknown mismatches still stop. A later migration failure rolls back the revocations together with the normal ledger writes.

The standalone preflight is still read-only and works under the restricted sandbox role. It reports `known_calendar38_permission_repair_required` rather than pretending the installation is already secure. It never executes its guarded REVOKE branch. The normal runner performs that branch under its existing database-owner privileges; no sandbox escalation or direct ledger write is needed. The guarded 0038 also performs the same validation/repair after an original fresh install, so the same platform defaults cannot recreate this gap there. It does not change global default ACLs or unrelated functions.

No new migration number is needed for this reported state because the normal runner must execute the unrecorded 0035–0038 wrappers. A database that already recorded all those files will skip them; this workaround does not repair such a database automatically, and it would need a separately reviewed additive migration or owner-issued revocation. Files 0039–0041 and journal timestamps remain unchanged.

After review and merge, ask Lovable to sync main, rerun the read-only preflight, and report its status. Either verified status or the narrowly recognized permission-repair-required status permits one normal migration run through 0041. Any other failure must stop. After that run, rerun preflight: it must report `known_calendar38_verified`; confirm anonymous execution is false for the four signatures, status functions return 39/40, and the ledger reaches 0041. Do not publish automatically.

Permission-repair validation: **27 actual PostgreSQL/Drizzle compatibility tests passed**, including the reproduced platform defaults with comment-stripped bodies, read-only preview, denied sandbox mutation, preservation of stored history, fresh install, strict rejection of unrelated authenticated/anon/service privileges, and transactional rollback. **812 application tests passed** (39 opt-in database cases skipped in that run; the 27 compatibility cases ran separately). TypeScript, production build, focused ESLint, deterministic generation and `git diff --check` passed. The separate 12-case experience transaction suite was not rerun for this permission-only repair. No production database or paid provider was accessed.


## Receipt-table default ACL repair and additive 0042

The next live preflight correctly stopped at `anon SELECT` on `calendar_action_receipts`. The reported default table ACL grants ALL to anon/authenticated/service_role and SELECT/INSERT to sandbox_exec. Original 0038 granted authenticated SELECT without first revoking inherited creation-time direct grants. The permission-only function repair did not cover that independent table issue.

The receipt manifest continues to require no anon privileges, SELECT-only authenticated privileges and all service-role privileges. A separate exact role/privilege allowlist recognizes only **excess** receipt privileges that can be revoked. Missing required read/service privileges, altered bodies, schema, RLS or owner policy still fail. All other validation completes before any function/table revocation. No global default ACL, ledger history, application records or unrelated table is modified.

Read-only preflight now identifies either function-only, table-only or combined known permission drift as `known_calendar38_permission_repair_required`. It does not mutate permissions or call the failure a verified secure installation. The normal privileged runner conditionally revokes the specific excess grants after validation and checks effective permissions. Grants still inherited through PUBLIC/other roles abort and roll back; the compatibility path never grants missing privileges. PostgreSQL 17's MAINTAIN privilege is checked as well, with a server-version guard for older PostgreSQL versions.

The same defaults also affect 0039's new `experience_scene_transitions` and `character_scene_state` tables. RLS restricts rows but does not constrain TRUNCATE. New additive migration `0042_calendar_scene_privileges.sql` therefore explicitly revokes anon/authenticated table privileges on exactly those two tables and the receipts table, restores authenticated SELECT, preserves existing RLS/policies and service permissions, and verifies the effective privilege matrix. No rows or table definitions are changed. It also revokes the four reviewed anonymous helper-function grants, covering installations whose historical 0035–0041 entries were already recorded and thus skip compatibility wrappers. Running 0042 twice is harmless. Missing RLS/service privileges or unrevocable inherited access stop it transactionally.

Historical 0035–0038 wrappers and preflight are regenerated from the shared verifier/manifest, with archived original SQL payloads byte-for-byte intact. Migrations 0039–0041 and their timestamps are unchanged; 0042 is appended to the journal at timestamp 1792950000003.

### Current Lovable instructions after review and merge

1. Sync main. Run `scripts/migration-compat/preflight.sql` read-only.
2. If it reports `known_calendar38_verified` or `known_calendar38_permission_repair_required`, run the ordinary migration command once **through 0042**. Any other mismatch must stop. Do not manually insert ledger rows, edit migrations to comments or grant the sandbox owner privileges.
3. Re-run preflight: it must return `known_calendar38_verified`. Check migration history through 0042, `experience_scene_status() = 39`, `calendar_edit_status() = 40`, and the existing 0041 delivery implementation.
4. Verify no anon table privileges; only authenticated SELECT; unchanged service access on the receipts and both scene tables, including TRUNCATE and (PostgreSQL 17+) MAINTAIN. Verify anonymous EXECUTE is false on the four reviewed helper functions. Inspect saved data without starting/completing existing user experiences as a test.
5. Do not publish automatically. Manual app acceptance remains separate from database installation.

Tests reproduce the **combined** reported function/table defaults, including the sandbox grant and comment-stripped bodies, under disposable PostgreSQL 17. They exercise read-only sandbox preflight without ACL/ledger mutation, actual Drizzle recovery, table-only drift, fresh installs, already-recorded history repaired only by 0042, owner-only authenticated receipt reads, denied authenticated TRUNCATE on all three tables, unchanged saved history, idempotency, rejection of missing required permissions/unknown invariants, inherited PUBLIC grants and full rollback when later migration fails. This is scoped hardening of these calendar/scene objects, not an audit or repair of every pre-existing public-schema table.

Table-permission follow-up validation: **36 actual PostgreSQL/Drizzle compatibility tests passed**, plus **12 existing PostgreSQL experience ownership/concurrency tests** with migration 0042 installed. **823 application tests passed** (48 opt-in PostgreSQL cases skipped there and run separately as the 36+12 above). TypeScript, production build, focused ESLint, deterministic generation and `git diff --check` passed. No production SQL, deployment, ledger edits or billable model calls were performed.
