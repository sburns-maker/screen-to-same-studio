# AI Town Social — proposed next phase, not implemented

## Purpose and boundary

An optional fictional in-app community feed can become another view of the existing world. It must never pretend to publish to a real social network, import real people's identities, or create private knowledge merely because a backend record exists. Messages remain private and remain the main direct communication interface.

This phase adds no feed tables, social network API, paid service or autonomous post generation. The following is a design for review.

## Proposed owner-scoped records

| Record | Key data | Rules |
| --- | --- | --- |
| Social profile | user/world ID, existing entity key, display name, active avatar reference, participation preference | Reuse approved characters/NPCs; avatar never silently replaces canonical identity |
| Post | user/world ID, stable post ID, author entity, source event/action ID, body, optional existing media ID, venue ID, created/visible/expiry timestamps, moderation state, visibility | Unique author/source-event/post-kind receipt; media uses existing private buckets and authenticated access |
| Audience grant | user/world ID, post ID, recipient entity/user, reason, grant time | Explicit audience allowlist; public-within-world is distinct from public-on-the-internet |
| Comment / reaction | user/world ID, post ID, actor, parent comment, body/reaction, source interaction, idempotency key, visible time | Validate audience and actor knowledge before writing; bounded depth/count |
| Social connection | user/world ID, source entity, target entity, request/accepted status, timestamps | Reuse acquaintance/consent records where possible; following never grants private messaging access |
| Read/knowledge receipt | post ID, reader, source channel, read time, knowledge record ID | Only actual authorized viewing or a grounded character interaction can propagate post facts |
| Moderation / retention record | object ID, reason code, reviewer/action, retention/deletion timestamp | Author removal, reports, blocked audiences, private-media cleanup and audit accountability |

All cross-record foreign keys must include the owning user/world. Client reads need RLS plus audience checks; mutation and simulation functions validate authorization server-side. Do not expose service-role keys or signed media credentials. Developer inspection does not mark a post as read or teach characters anything.

## Event-driven autonomy

1. A real durable world event or explicit venue action completes.
2. A deterministic rule checks author preferences, event suitability, relationship/audience constraints, quiet hours, deduplication, recent topics and per-user budgets.
3. Ordinary low-value updates can be skipped. Reserve a bounded generation job only for meaningful eligible moments; use the existing leased scheduler, retry/backoff and usage ledgers.
4. Generate one proposed caption through the approved text model, with only the author's knowledge. An ambiguous/uncertain paid failure must not trigger repeated generation.
5. Validate that the content matches its source event, avoids unrelated private facts and respects media permissions. Delivery is an atomic post/audience/job receipt transaction.
6. Interested characters may later react through a bounded scheduled action. No reply-to-reply recursion and no unbounded AI-to-AI thread loops. Knowledge changes cite the actual authorized post or interaction.

Photography is optional and separately budgeted. Prefer reuse of an appropriate existing image the author is permitted to share. New group imagery must pass current multi-reference/identity screening and attendee checks. No image is generated for a routine reaction or page view.

## Privacy, moderation and costs

A private date, confidence shared in chat, home address or confidential community-service interaction is not eligible for publication by default. Public event participation does not imply permission to identify every attendee or publish their photos. All H.O.P.E. content remains fictional and must not imply real client/staff records. Moderation should reject disclosure of another character's private messages, targeted abuse and unsuitable media, with owner reporting and block/mute controls.

Specify retention before launch: owner export/deletion, immutable audit receipts with minimal retained personal data, media deletion policy, unpublish behavior and how later memories represent removed material without retaining private content. Never automatically canonize unverified jokes, rumors or provisional posts.

Start with a **read-only event-backed announcement prototype** and explicit user opt-in; then allow a very small author audience. Suggested configuration for review: daily post-attempt ceiling, daily comment ceiling, maximum comments per post, background-token allocation and separate image-attempt caps. Keep all defaults off until approved. A 100-NPC population must not imply 100 daily generations: cheap eligibility checks select a bounded subset, and silence is valid. Compare real usage after a small trial before expanding.

## Future acceptance gates

Test source-grounded content, audience isolation, no default chat disclosure, actual viewing/knowledge receipts, delayed visibility, moderation/removal, owner deletion, media authorization, durable scheduler recovery, duplicate/retry protection and strict global/per-user budgets. Require a live preview review before enabling autonomous paid posts. A feed prototype must clearly label itself as fictional simulation content.
