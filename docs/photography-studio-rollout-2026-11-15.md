# PR #245 — production database rollout

## Database and backup

- Applied to the existing Lovable Cloud database shared by preview and published app, not the isolated rehearsal database. No database replacement.
- User confirmed a recent restorable backup at **19:00 UTC** before execution. The timestamp/date and backup inventory cannot be independently inspected by the agent; no restore was performed.
- Read-only preflight confirmed the installed 0080–0087 ledger entries and absence of the new studio tables.

## Migration results

- **0088 succeeded** against the project database: ventures, venture events, snapshot/action functions and enabled asset-sale trigger verified afterward.
- **0089 succeeded** afterward against the same database: sessions, snapshot/action functions and schedule index verified afterward.
- Initial 0088 attempt failed on an existing local filename before any SQL ran. Exact source files were staged temporarily outside the project to resolve the tool collision.
- Execution of 0088 inadvertently differed from the PR in two indentation spaces only; no executable statement changed. Original PR bytes were restored in source control. The actual installed ledger hash is `ffb13d97f548e6642ed4e8a9a53db21f495a884b334acc4d857a17a31d1755ef`; PR file hash is `ef1568a7dbf877f36d809a4ae0a4a9441f371b28d0f174e1d4a2c05841926ad0`. This formatting-only difference is disclosed, not recorded as an exact-byte execution match. Ledger rows were not edited and 0088 was not reapplied.
- 0089 executed byte-for-byte; installed/source hash `4b3bd4cf8a00e29a78c4bec7d78b8445c4c928d7298006961a0dcb8350e4c390`.
- Migration timestamps: 0088 `1794703024478`; 0089 `1794703065352`. Both exceed the prior newest entry. Generated journal, snapshots and app types updated by the migration tool.

## Financial integrity and existing data

- Before/after: **13 conversations, 49 experiences, 2,018 moments, 18 pregnancy events, 1 finance account, 28 finance assets**. No reset or deletion was performed.
- Messages increased from **10,493 to 10,495** during concurrent app activity. Finance ledger increased from **26 to 34**.
- Cash decreased from **291,709,975,000 to 289,709,975,000 cents**, exactly accounted for by a concurrent `management_upgrade` debit of **2,000,000,000 cents** at 00:36:35 UTC. Seven subsequent management disclosure records have zero cash amount. These were not studio migration or agent test actions.
- Company reserves remained zero. No negative cash, loans or reserves; no duplicate ledger request IDs or orphan studio events/sessions.
- All three new tables remain empty. No production studio, booking, purchase, employment or consent fixtures were created.
- New primary keys, composite owner/venture foreign keys, validated constraints, active-venture uniqueness index and booking index confirmed.
- Live `finance_virtual_date(date,date)` definition remains seven financial days per real day. Other clocks were not changed.

## Security

- RLS enabled on all three new tables; anonymous and authenticated direct SELECT/INSERT/UPDATE/DELETE denied. Service role has required privileges.
- All five new functions are SECURITY DEFINER with `search_path=public`, no anonymous/authenticated execution and service-only execution.
- Prior isolated rehearsal verified cross-player isolation and request idempotency; live verification checked installed permissions and constraints without mutating player data.
- PR's direct auth-user foreign keys were preserved; deleting an auth account cascades its studio records. No account was deleted.

## Tests and app compatibility

- Prior isolated rehearsal: both migrations applied; **28 service-side check groups passed**. Exact PR PostgreSQL workflow also passed, including fixtures, as recorded in the earlier report.
- Fresh local regression: **7 finance tests passed across 3 files**.
- Signed-in `/finances` loaded the studio section, all three acquisition paths and history without a migration warning or page errors; screenshot inspected. No action button was clicked and no venture was created. Booking mutations remain verified by the prior isolated rehearsal, not a production purchase.
- Preview build log: **build OK** after schema/type updates.

## Remaining attention and readiness

- Both requested migrations are complete and verified. **Database ready for PR #245 application code**; PR was already merged according to the prior GitHub check. No merge or publication performed here.
- Earlier unrelated **0068_scene_activity_private_moment** remains skipped by timestamp ordering. Tool repeated the warning; it was not modified or silently applied.
- 0088 has the disclosed formatting-only installed/source hash difference above; no functional incompatibility found.
- Unrelated roadmap blockers remain reference photos needing higher resolution and unavailable PR-creation capability; neither blocks these database changes.