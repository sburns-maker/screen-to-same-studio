# Private player economy — first playable slice

All money and assets here are fictional. No real-world payments, ownership or employment.

## First slice implemented

- Per-player $5 billion virtual cash and $3 billion virtual investments; private by default.
- Server-side snapshot/actions; financial tables and RPCs only accessible to service role.
- Cash and financed acquisitions (25% down, 8% APR, 120 months with declining principal), resale at listed book value. Idempotent request UUIDs and row locking.
- 28 virtual purchasable businesses and properties. The virtual catalog includes replicas named for real Altoona institutions, such as UPMC Altoona at a player-selected fictional $2 billion valuation. No actual institution is for sale, its staff have not changed employers, and all pricing and modeled financials are invented.
- Monthly business and rental operations, payroll of named characters and baseline unnamed staff, fictional player salary, loans, retained company reserves, owner draws (automatic 0–100% of after-expense monthly income or manual), and 2% revenue growth every 3 ownership months, capped at 200% of opening revenue. Salary changes are owner-only and do not alter employment autonomy.
- Purchase and wealth-preference changes do NOT automatically reveal riches, modify character relationships, employment, or permission to enter their workplace.

## Financial time acceleration

- Fixed pace: **one real calendar day advances seven days on the financial clock** (anchored to first creation of the player finance account, using the America/New_York date).
- In-game monthly salary, business operations, payroll, loan payments and automatic owner draws trigger whenever the accelerated finance date crosses a complete virtual calendar month (approximately every 4–5 real days).
- Revenue rises 2% every three *virtual ownership months*, to a maximum of twice the initial business revenue. Manual owner draws remain immediate.
- Monthly settlements remain idempotent by (player, asset, virtual month). The world job may run every 30 minutes, but the finance time moves only once per real calendar day.
- This financial clock does **not** advance relationships, character ages, pregnancy, work shifts or housing progression.
- Accelerated financial history may show virtual months ahead of the actual date. These are never actual transactions or real salaries.

## Discreet professional identity

- Default parent-company name: **Northline Group**.
- Default public job title: **Director of Special Projects**; intentionally broad so other characters do not infer billionaire ownership.
- Both fields are editable by the player in Finances. Values are private finance-profile data; changes do not automatically cause character knowledge or reveal wealth.

## Activation
Apply drizzle/migrations/0080_private_wealth_economy.sql **then** drizzle/migrations/0081_financial_management.sql to the deployment database, then deploy the app branch. A GitHub commit does not apply SQL by itself.

## Business-management extension (migration 0081)

- Owner-only management commands: add/remove recurring household bills; hire and release simulated new staff; purchase up to five income-improving upgrades; disclose an owned asset or ordinary professional identity to one chosen character. All are written atomically with an idempotency request receipt.
- Named original characters are protected from click-to-fire and forced relationship changes. Employee raises continue to use the salary tool from 0080. Business upgrades increase the stored monthly revenue baseline; month-by-month deterministic customer demand varies realized revenue by -6% to +6%.
- Personal bills settle once per accelerated virtual month *starting no earlier than the bill creation month*; a separate per-bill ledger prevents double charging.
- Character-scoped disclosed finance context is used by the existing AI conversation pipeline. No global wealth context is injected, and purchases do not automatically trigger a character reaction. The character can discuss a fact after an explicit reveal, but does not gain ownership of an employer or control over private records.
- A purchased virtual home does not itself move an NPC or change the household. Use the existing housing-consent workflow to handle moving; financial title does not equal physical access.

## Virtual investment extension (migration 0082)

- Three private fictional funds: Broad Market (initial $3 billion), Income and Growth. Owner cash can be allocated or sold between funds atomically; no actual public-market transactions occur.
- Fund returns are deterministic, can be negative, and are settled once per completed accelerated virtual calendar month. Each trade first settles already-completed months so new investments cannot receive past gains.
- A per-fund virtual-month receipt prevents duplicates; the total portfolio market value is reconciled into the account investment balance. This is not a real investment calculator or an external price feed.

## Character-specific pay notices (migration 0083)

- A salary adjustment records a private pay notice only for the named character affected, with the old and new simulated salary. Their AI conversation context receives their own pay information, without revealing who controls the workplace or who else got a raise.
- Repeated salary-change request IDs create no extra notice. Other characters have no visibility into those pay notices.

## Not yet implemented
Full autonomous NPC job applications/promotions/resignations, household move synchronization after a purchase, brokerage or real-security price feeds, detailed individual employee records for initial unnamed staff, configurable player salary, and automated NPC reactions before the player explicitly discloses ownership. Those are subsequent phases, not currently functional features.

## Security/test checklist
The dedicated `Private billionaire economy` GitHub workflow applies all four finance migrations in disposable PostgreSQL, checks balance/loan/payroll/draw invariants, staffing, upgrades, private disclosures, recurring bills and repeat ticks, then runs finance unit tests. The broader CI workflows check TypeScript, build, and existing world behavior. Review live CI results before merge. No production deployment or migration is claimed here.

## Deployment gate

1. Confirm a point-in-time production database backup and an SQL dry-run against a disposable database with the current production schema, not just the finance fixture.
2. Review and apply migrations 0080, 0081, 0082 and 0083 **in ascending order** before publishing UI code.
3. Run `Private billionaire economy` and the full pull-request check suite, including TypeScript and build. Check for unrelated baseline failures before blaming finance.
4. On a non-production account, verify private wealth setup, a $2B fictional UPMC purchase, an employee raise, a new hired worker, one upgrade, a monthly bill, confidential disclosure, investment trade, and accelerated month settlement.
5. Verify player-to-player isolation and the specific character's financial-knowledge prompt. Check no real institutions appear as actual sellers/employers.
6. Promote the app code only after database migration and end-to-end review. Keep PR as draft until this gate is satisfied. If rollback is needed, revert the app deployment before touching financial database tables. Preserve ledgers, pending purchases and balances; **never drop the new tables as a quick rollback**.

This branch has not been deployed to production. The tests use simulated balances and synthetic users.
