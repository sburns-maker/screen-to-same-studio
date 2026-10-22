# Phase 4C: authoritative profile portraits

> Updated by migration 0017: [Media viewer and explicit identity management](./mobile-media-and-identity.md). Bundled portraits remain the defaults and are never overwritten. A separate avatar-only edit preserves the current anchor; an explicit user-approved canonical replacement stores private per-user reference bytes used by all supported generation paths. The original-only descriptions below document the earlier implementation.

## Finding and fix

The inbox, chat header and profile screen display bundled `CharacterDef.avatar` assets, not `characters.avatar_key` or a Supabase profile URL. Generation previously downloaded separate files named `tess-reference/canonical.jpg`, `maya.jpg`, etc. There was no byte/hash relationship between those files and the UI portraits. We cannot inspect production storage here, so this proves an implementation gap, not which bytes Maya's past request actually used.

| Character | Existing authoritative asset |
| --- | --- |
| Tess / Jessica | `src/assets/tess.jpg` |
| Maya | `src/assets/avatars/maya.jpg` |
| Claire | `src/assets/avatars/claire.jpg` |
| Jordan | `src/assets/avatars/jordan.jpg` |
| Ben | `src/assets/avatars/ben.jpg` |

`character-portraits.ts` supplies the same existing URLs to the UI. `canonical-profile.server.ts` embeds those exact original JPEG bytes into the server build using Vite `?inline`. Generation no longer fetches a mutable storage alias or assumes a model can see an avatar URL. Tests compare every embedded reference byte-for-byte with the displayed source asset and assert distinct SHA-256 anchors across characters. Originals, historical generated images, storage objects, conversations, scores and memories are not changed. No migration or upload is required.

The server uses no filesystem or external profile-URL fetch at runtime; this works in the existing Cloudflare deployment and offline world worker. Profile bytes are not added to the client JavaScript. Existing UI image assets retain their existing access behavior. Generation still requires the owned conversation and uses its character definition; the model cannot choose a different character's reference. Debug comparison images use the owner's private bucket and a 120-second signed URL after authentication/allowlist checks.

## Shared generation service and provider

`generateTessImage` is the shared entry point for user replies, contextual photos, autonomous jobs and developer tests. Human images require an explicit registered character and verified provider reference-conditioning configuration. The service obtains the original portrait itself; a caller-supplied blob, previous image, description or temporary outfit cannot replace it. Every successful new image is checked before storage upload and message delivery. Object photos load no human portrait and are screened for scene consistency instead.

The current direct provider remains **OpenAI `gpt-image-1-mini`**, 1024×1536, medium quality by default. It receives actual JPEG blobs through `/v1/images/edits`. The profile is the first image; Tess's optional existing Mabel reference can be second. A foster puppy or generic dog is no longer automatically treated as Mabel. Object/environment images use `/v1/images/generations`. Existing text-quality/high-quality settings from Phase 4B are retained. No identity-strength/reference-weight parameter is invented. Masked inpainting, identity-specific weights and seeded character guarantees are not integrated.

The old gateway model remains configured but is **not accepted for new character portraits**: its reference-conditioning fidelity has not been established. A gateway-only environment also lacks the direct OpenAI vision key required for screening and fails before buying an image. The normal project already uses `OPENAI_API_KEY`; no provider/model switch or new vendor is introduced. The direct endpoint shape and multipart payload are covered by tests; actual account permissions and fidelity still need live acceptance.

## Quality screening and limits

Before generation, the server checks JPEG structure/dimensions (minimum side 256px, maximum 8192px, maximum 4MB). It preserves original bytes; no face restoration, synthetic upscaling, crop rewrite or unapproved replacement portrait is performed. All current portraits pass these structural tests. This is not proof that every face is unobscured. The subsequent visual screen can report an insufficient/obscured original. If a better reference is needed, stop and propose a candidate for explicit user approval; never promote a generated photo automatically.

One bounded **`gpt-4.1-mini`** vision request compares the fictional visual design and scene with the actual portrait. It screens for obvious departures in facial proportions, complexion, age/hair characteristics and requested activity, while allowing pose, lighting, clothing and expression changes. It does not perform biometric recognition, produce a face-similarity score or assert real-person identity. Uncertainty, hidden/small faces, obscured references, scene mismatches, unexpected people, provider refusals and malformed responses fail closed. Object/pet/environment images receive only scene screening and no human-reference requirement. Existing restrictions on bystanders and group photos remain; this change does not invent supporting-person identities.

A screen pass is **not proof of recognizable identity**. Vision models may miss drift or reject a good image. `gpt-image-1-mini` has no consistency guarantee, and the screen is not an infallible face matcher. Only inspection of actual outputs across varied scenes can establish acceptance. Do not recommend deployment solely because automated tests pass.

Failed images are withheld before upload and caption delivery. Safe diagnostics include canonical asset/hash, conditioning, provider/model, mode, validation status/reason, source, delivery outcome and retry count. They contain no key, image bytes, provider body or free-text personal information. Failures appear in owner-scoped `world_events`; successful metadata lives with the message. A stored `screen_passed` value means only automated screening passed. The existing atomic outbox, image-attempt budgets and duplicate prevention remain in force.

There is **no automatic image regeneration**, including on failed comparisons. This follows the existing rule against recharging an uncertain action. The ledger keeps the failed action terminal; a developer may approve a separate, budgeted opportunity after inspecting the failure. Existing already-generated/prepared deliveries and historical images are preserved rather than silently rewritten or retroactively relabeled as screened. Historical results can still look different; they are not examples of the new service.

## Observability and safe browser testing

Settings → Advanced now checks all five bundled canonical references rather than listing an unrelated storage alias. Developer preview reports structural asset status, asset/hash and screen/conditioning configuration. It buys no image or vision check.

In an owned conversation's hidden developer debug screen, **Canonical photo identity** displays the original profile beside the latest visible generated image, plus diagnostics. Historical results may have no validation metadata. Failed attempts and reasons appear under persistent world diagnostics / the living-world timeline. A prepared/delayed image is not presented as delivered before `visible_at`.

Developer actions retain `ENABLE_DEV_PHOTO_ACTIONS=true` and `DEVELOPER_PHOTO_USER_IDS`. `OPENAI_API_KEY` is required for generation and the visual check; existing Supabase server/storage and delivery configuration is unchanged. Do not place keys in browser variables. Nothing here deploys, changes secrets, alters production data or buys test images.

## Controlled visual acceptance matrix — pending

No OpenAI or production service-role credentials are present in this workspace. Live multi-image testing could not be performed; do not mark it passed. After reviewing the branch, use the existing developer preview/share tool with separate approved opportunities and normal schedules/cooldowns:

| Character | First setting | Distinct second setting | Object-only control |
| --- | --- | --- | --- |
| Maya | Quiet event-venue selfie | Outdoors, different jacket/light/angle | Venue setup without people |
| Tess | Casual clinic break selfie | At home, different outfit/pose | Foster puppy, no Tess/Mabel unless actually present |
| Claire | Library-display selfie | Garden selfie, different light/angle | Garden without people |
| Jordan | Understated outdoor selfie | Seated at home, different angle/outfit | A contextual object |
| Ben | Parked work-truck selfie | Casual home setting | A safe project detail |

For each human image compare against the **existing profile**, not the previous generation. Inspect face shape, eyes/spacing, nose, lips, jaw/cheekbones, complexion, age impression and hair family. Permit ordinary variation; reject a generic similar-looking face even if the screen passed. Inspect real image bytes, attachment delivery, diagnostic anchor/hash, source and notification behavior. For object controls verify scene/context and no unintended people; do not require a face. Use the normal world-tick action to test unsolicited delivery with the app closed; it may legitimately select no photo. Do not bypass schedules or artificially raise relationship scores for testing.

A new request can incur an image charge even when withheld. Do not repeatedly click delivery to chase a likeness. Automated tests use fake paid providers and disposable PostgreSQL; they verify routing, anchors, failure handling and persistence, not human resemblance.

## Costs and possible next step

New cost: **one vision call per new generated photo attempt**, capped at 250 output tokens and 20 seconds, plus input image tokens. Human checks send two images; object checks send one. Phase 4B text-heavy photos can add their separate one-call lettering screen. Image-attempt quotas still bound these calls; there is no added image regeneration or automatic high-quality escalation. Existing images are not repeatedly checked. Allow additional latency; platform request-duration limits must be validated during deployment.

No new credential or paid vendor is required. If the real acceptance matrix still fails, compare a currently available OpenAI model with stronger documented high-fidelity reference editing against the same originals, with explicit pricing/access review and a small fixed test budget. Model names/availability and stronger fidelity are not assumed here. A separately evaluated identity-conditioning model could improve fidelity but adds operational/privacy/cost implications and should not be silently substituted. This implementation repairs the reference source; it does not claim a universally reliable identity-generation model.
