# Hands-off ownership and optional co-ownership offers

Follow-up to merged PR #241.

## Migration sequence
Apply 0084_hands_off_ownership.sql, followed by 0085_optional_equity_offers.sql, on a backup-tested database after migrations 0080–0083. These introduce service-only tables and RPCs.

## Hands-off policy
- The player may record independent operational management, reporting hierarchy and HR conflict review for a fictional acquired business.
- Enabled policy blocks direct salary modifications and hiring/releasing of fictional employees at the database trigger boundary; existing named characters keep their own agency.
- The policy can be copied into a written statement. A saved policy is a fictional game record, not a signed legal employment agreement or proof of manager acceptance.
- Only characters specifically told about ownership see governance context. The player's wealth remains private.

## Voluntary half-ownership proposal
- A player can offer a character, including Tess, a 50% share of an owned fictional operating business, after saving hands-off governance.
- The offer begins pending; it is not an acceptance, and it does not transfer equity, change profit allocations, or alter any existing ownership. Marriage creates no special acceptance.
- The player can withdraw a pending proposal. Its intended recipient alone can see the pending offer in character context, and can freely discuss or decline it.
- Actual transfer will require a separate explicit mutual-acceptance workflow with an enforceable in-game cap table and share of profits. Such a transfer is not implemented here.

## Release verification
The Private billionaire economy GitHub workflow applies migrations 0080–0085 on disposable PostgreSQL and verifies role isolation, payroll guard, idempotency, optional offer and withdrawal. Confirm production backup, staging migration, UI and character conversation smoke tests before release. Do not represent fictional acquisitions as real-world transactions.
