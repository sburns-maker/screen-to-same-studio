# Private relationship discussions

The relationship cards support Tess, Maya, Riley, Claire and Jordan. Ben remains
platonic. Proposing saves only the player's decision. Each character can accept,
decline, defer or independently propose; scores never grant agreement.

“Discuss in messages” opens that exact conversation with an editable draft for
exclusivity or partnership. The player taps Send. Drafts are one-use, tab-local,
keyed by conversation and validated against its loaded character. Existing
composer text is preserved. No conversation is created and no AI request is
made by navigation. A full composer keeps its existing text; reopen the card
later to prepare the relationship message again.

Proposals and decisions are selected by authenticated user and character. The
service-only synchronization RPC ingests only that character's already-visible
messages in an owned conversation, requires exact quoted evidence and matches
proposal ID/kind/owner/character. Hidden messages, another character's response,
closed proposals and another user's proposal cannot supply consent. Character
proposals still require separate player acceptance. No cross-character social
notification, knowledge propagation, household transition or score propagation
is added. The player can still explicitly discuss their own life in messages;
this feature does not automatically disclose another conversation.

## Lovable deployment

Apply additive migration `0053_private_character_commitments.sql` through the
existing migration flow, then publish the reviewed application. It creates
`relationship_sync_character(uuid,text)` and makes the existing Tess RPC a
compatible wrapper. It fixes an ambiguous SQL table alias that collided with
the loop record in the prior synchronizer. Existing events, conversations,
memories and housing are preserved. No new secrets are required. Additional
character cards stay unavailable if the new RPC is missing; legacy Tess history
remains readable. No production database scripts or deployment were run here.

The schema adds functions only, following existing RPC casts; no table/type
changes or data reset. Tests exercise SQL ingestion, ownership and character
isolation, visibility, refusals, idempotence, player consent, client ACLs, the
legacy wrapper, all five cards and draft consumption without automatic sending.
After publication, review one pending proposal in each character's chat and
confirm its decision appears only on that contact's card. Do not resubmit an
existing pending proposal merely to test it.

## Availability and missing cards

The relationship card is a direct part of Contact info, independent of housing
readiness. Supported characters show a loading state or a retryable unavailable
state rather than disappearing. If synchronization fails, existing owner- and
character-validated milestones remain readable; relationship commands remain
blocked until synchronization is ready. Open messages remains available for
ordinary conversation, without pretending a proposal was saved.

Troubleshooting shows only the failed phase (storage/sync) and an allowlisted
PostgreSQL/PostgREST code. No raw error messages, transcripts, URLs, credentials
or another character's state are exposed. PGRST202/42883 can indicate an RPC
missing from the schema cache; 42P01/PGRST205 can indicate missing storage;
42501 indicates permission failure. Other failures require diagnosis rather
than assuming every unavailable result means an unapplied migration. Tess's
legacy fallback is available only when that call itself succeeds.

The repository now contains Lovable's 0054 wrapper applying the 0053 functions.
A repository commit is not proof of successful live schema state or publication.
Inspect the safe code from the actual failing environment and verify its
applied migrations/function grants and schema cache. This UI fix needs no
additional migration. Never reset existing proposals or relax ownership/consent
to make a readiness check pass.
