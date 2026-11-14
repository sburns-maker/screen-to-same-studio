# Photography studio ventures (fictional)

Implementation PR #245. Additive database migration **0088**; run only after 0080–0087 have been applied.

## Player experience

Open **Finances → Photography studio ventures**. Choose an existing natural-light studio, lease a low-cost loft, or build a new storefront.

1. Research the opportunity without transferring ownership. Complete books ($250), premises ($450) and permits ($150) reviews.
2. Offer 85%–100% of asking price, choose cash or 25% down financing (financing not available for a leased studio). The seller requires **two virtual finance days** to respond; below 95% of asking generates a midpoint counteroffer. Offer expires after 28 virtual days.
3. Finalize a deal, with closing charges and loan principal recorded in the existing finance accounts. Ownership is real within the fictional finance ledger, but the business has **no operating revenue until launch**. Loan obligations may begin at closing.
4. Purchase lighting ($1,850), editing equipment ($1,450), interior/client area ($2,500) and online booking ($950). Lighting and booking are mandatory for launch. Launch as portraits, mixed portrait/rental, or room rentals.
5. Once open, monthly revenue, fixed costs, business reserves, debt servicing, revenue growth and owner draws use the existing financial-world clock (one real day = seven financial days). Marketing campaigns cost cash and increase ongoing revenue AND overhead. Company finances can be viewed in the standard asset portfolio.
6. Sell the asset via existing finance interface to archive the venture. In-game acquisition and management events are logged with request IDs to prevent duplicate spending.

These are simulated opportunities, fictional valuations, costs and projections, **not** offers to acquire a real company or property. A lease option represents the simulated operating business and lease deposit, not title to a building.

## Sienna and consent

The **Discuss with Sienna** action only makes the proposed opportunity known in her character-specific financial context. It does not employ her, appoint her creative director, transfer shares, or assume agreement. Sienna's response is generated independently in the usual conversation flow. Actual employment and equity must use separate recorded agreement processes; no claim is made that the game already tracks her formal studio acceptance.

## Deployment

- Back up production and verify migration history before applying 0088; run migration in a restored rehearsal DB, and never recreate or overwrite user accounts.
- Apply `drizzle/migrations/0088_photography_studio_ventures.sql` once.
- The existing service-only finance RPCs remain intact. New tables `finance_ventures` and `finance_venture_events` have RLS and service-role-only access.
- Run `src/test/fixtures/finance/photography-venture-checks.sql` after migrations 0080–0088 in a scratch DB, **not on production**, because it creates and sells test assets.
- Deploy the PR application code after migrating; check Finances/Photography studio ventures on mobile.
- Do not speed up social, relationship, pregnancy or other physical time. The seller's waiting period uses virtual **financial** dates only.
- Monitor transactions, idempotency, closing balance, ownership and monthly settlements after deployment.

## Not implemented

There is no actual legal deed, share certificate, tax filing, real third-party payment, provider-facing booking calendar, photo file storage or independently signed Sienna employment agreement. Future work could add individual session reservations, client reviews and an independent formal role-offer/acceptance workflow.
