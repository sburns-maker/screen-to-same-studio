# Private player economy — first playable slice

All money and assets here are fictional. No real-world payments, ownership or employment.

## First slice implemented

- Per-player $25 million virtual cash and $15 million virtual investments; private by default.
- Server-side snapshot/actions; financial tables and RPCs only accessible to service role.
- Cash and financed acquisitions (25% down, 8% APR, 120 months with declining principal), resale at listed book value. Idempotent request UUIDs and row locking.
- Fictional After Dark, Northlight Studio and Copper Lens workplaces, plus a virtual townhouse and commercial property. Real institutions in the workplace registry cannot be purchased.
- Monthly fixed operations, loans, recurring property expenses, ledger, history, and Finances UI under More.
- Purchase and wealth-preference changes do NOT automatically reveal riches, modify character relationships, employment, or permission to enter their workplace.

## Activation
Apply drizzle/migrations/0080_private_wealth_economy.sql to the deployment database, then deploy the app branch. A GitHub commit does not apply SQL by itself.

## Not yet implemented
NPC employment compensation/raises, player salary and bills, property-linked housing move, business upgrades, fluctuating customer demand, explicit character-scoped reveal of ownership, and investment trading. Those are subsequent phases, not currently functional features.

## Security/test checklist
Verify migration against isolated Postgres; RLS/service-role boundaries; concurrent requests; idempotency; monthly catchup; loans; mobile UX. No production deployment or test pass is claimed here.
