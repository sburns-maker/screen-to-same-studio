# Hands-off ownership and optional co-ownership offers

Follow-up to merged PR #241.

## Migration sequence
Apply 0084_hands_off_ownership.sql, followed by 0085_optional_equity_offers.sql, then 0086_finance_agreements_and_equity.sql, on a backup-tested database after migrations 0080–0083. These introduce service-only tables and RPCs.

## Hands-off policy
- The player may record independent operational management, reporting hierarchy and HR conflict review for a fictional acquired business.
- Enabled policy blocks direct salary modifications and hiring/releasing of fictional employees at the database trigger boundary; existing named characters keep their own agency.
- The policy can be copied into a written statement. A saved policy is a fictional game record, not a signed legal employment agreement or proof of manager acceptance.
- Only characters specifically told about ownership see governance context. The player's wealth remains private.

## Voluntary half-ownership proposal
- A player can offer a character, including Tess, a 50% share of an owned fictional operating business, after saving hands-off governance.
- The offer begins pending; it is not an acceptance, and it does not transfer equity, change profit allocations, or alter any existing ownership. Marriage creates no special acceptance.
- The player can withdraw an unanswered or accepted-but-not-finalized proposal. Its intended recipient alone can see the offer in character context, and can freely discuss or decline it.
- Migration 0086 adds a written employment agreement for the named recipient, trackable as delivered, acknowledged, revision requested or stale after management changes. The agreement is a game record, not a real legal signature. The recipient must explicitly acknowledge in character dialogue before ownership can be accepted. Repetition of the initial request should stop after acknowledged status, unless terms materially change.
- A separate offer term sheet explains fictional economic participation, debts/losses, independent management and no unilateral sale. A character can autonomously accept, decline or defer in **their own saved visible reply** using structured exact-quote evidence. The database checks the message source and the quote; a player click cannot consent for the character.
- After the character clearly accepts, the player must press Finalize to create a true game-world 50% equity stake. Until then, no shares or dividends change. Afterward, owner draws and net operating distributions split 50/50, with per-partner audit records; the player controls only their retained half of asset equity, and one owner cannot sell unilaterally. No real shares, employers or liabilities change.
- The in-game equity ledger does not implement a legal stock certificate, tax allocation or a full joint-owner voting system. Explicit agreements and approval would be needed for future joint-sale or buyout operations.

## Release verification
The Private billionaire economy GitHub workflow applies migrations 0080–0086 on disposable PostgreSQL and verifies role isolation, payroll guard, idempotency, optional offer and withdrawal. Confirm production backup, staging migration, UI and character conversation smoke tests before release. Do not represent fictional acquisitions as real-world transactions.
