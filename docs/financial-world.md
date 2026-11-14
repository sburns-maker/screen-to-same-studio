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

## Activation
Apply drizzle/migrations/0080_private_wealth_economy.sql to the deployment database, then deploy the app branch. A GitHub commit does not apply SQL by itself.

## Not yet implemented
NPC hiring/firing, personally configurable expenses and bills, property-linked housing moves, upgrades, fluctuating customer demand, explicit character-scoped ownership reveals, investment trading, and full per-employee payroll for unnamed staff. Those are subsequent phases, not currently functional features.

## Security/test checklist
Verify migration against isolated Postgres; RLS/service-role boundaries; concurrent requests; idempotency; monthly catchup; loans; mobile UX. No production deployment or test pass is claimed here. SQL and UI need isolated-db execution and automated validation before merge.
