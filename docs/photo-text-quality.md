# Generated-photo lettering: Phase 4B

## Provider audit

The current server selects direct OpenAI **`gpt-image-1-mini`**, 1024×1536, medium quality when `OPENAI_API_KEY` is present. Otherwise it retains the existing Lovable gateway model **`openai/gpt-image-2.5-sunburst`**. Neither model nor character references were replaced. The application already uses `/v1/images/edits` with canonical image references for character photographs and `/v1/images/generations` for environment/object images. These reference edits preserve the established character and optional Mabel reference.

Direct OpenAI requests support the existing reference/edit route and quality parameter; an optional high-quality request is now integrated for essential lettering. Tests verify the outgoing API fields, not live account access. The gateway's higher-quality, mask/inpainting and targeted-edit capabilities have not been established, so no such options are sent. Masked inpainting/targeted regeneration are not integrated for either route. A model-name capability descriptor is conservative configuration metadata, not a live capability probe. Public OpenAI documentation could not be re-fetched in this environment (network proxy returned 403), and no paid provider requests were made.

## Behavior

- Every new generated image receives composition guidance against random lettering. Libraries and printed materials favor page edges, turned-away spines, distant shelves, and ordinary depth of field. Clothing/packaging are unbranded; incidental signs and screens are omitted. Original smartphone-photo, privacy and identity instructions still apply. Curated images and already-generated user photos are unchanged.
- The dialogue schema has nullable `photo.text_spec={exact,surface}` for one essential, conversation-grounded phrase up to 80 characters. Multiline and control-character text is rejected. It requests exact spelling, case and punctuation on a physical surface with consistent perspective, texture, lighting and focus. Other text is suppressed.
- Required lettering is screened using one independent `gpt-4.1-mini` vision request. The intended phrase is deliberately not supplied to the verifier: it transcribes what it sees, then the server compares that transcription with the required string. Case/punctuation must match (Unicode NFC is permitted). Uncertain required lettering or obvious prominent pseudo-writing fails screening.
- Text-prone scenes (books/libraries, signs, menus, notes, labels, packaging, etc.) also get one vision request when available, even without a required phrase. Tiny naturally unreadable background lettering is acceptable; prominent garbling is not.
- Failed, malformed, unavailable or timed-out screening prevents upload/delivery of that generated image. The existing action ledger prevents retrying its image generation. No image-edit loop, second generation, automatic high-quality retry or separate background recheck is introduced. The failed attempt still counts toward the existing image-attempt budget. Exact lettering fails before buying an image if screening is unavailable. Incidental lettering without a configured verifier uses avoidance composition and reports `not_checked`, never a verification claim.
- Delivered generated-image message metadata records `text_quality` as `screen_passed` or `not_checked`. Screening logs only safe status/model fields, not image bytes, transcriptions or keys.

A screen pass is probabilistic, **not a spelling guarantee**. A vision model may overlook defects or misread letters. Casual image softness remains intentional; the entire scene is not sharpened for typography. Future fresh requests can choose less text-heavy compositions, but a required sign is never silently replaced with a blank one. Requests requiring factual real-world photographic evidence are outside this fictional-image workflow.

## Why no deterministic text overlay

A font rasterizer could guarantee source glyph spelling, but it cannot guarantee photographic integration without reliable surface corners, masks, depth/curvature, occlusion and lighting. Current model output supplies a scene and style, not those geometry records. Flat captions, invented homographies or another native image dependency in the Cloudflare runtime would be a brittle addition. This implementation therefore uses the provider's physical-text rendering and rejects failed screening; it does not claim an accurately composited overlay pipeline. Manual masked editing could be evaluated later with explicit geometry and an approved extra image charge.

## Server settings and costs

No migration or new credential is required. Existing `OPENAI_API_KEY` supplies both direct images and vision screening.

| Setting | Default | Effect |
| --- | --- | --- |
| `IMAGE_TEXT_QC` | enabled | Set `false` to disable vision; required lettering then fails before image generation. Incidental compositions remain unverified. |
| `IMAGE_TEXT_QC_ALL` | off | `true` screens all generated photos when vision is available, adding one vision call each. |
| `IMAGE_TEXT_HIGH_QUALITY` | off | `true` requests `quality=high` only for essential lettering on the supported direct provider. Higher image cost; no change to other photos or gateway quality. |

Default extra cost is at most **one vision call per text-prone or exact-text photo attempt**, with a 300-token output cap and 20-second timeout. Ordinary non-text scenes add no QC call. Input vision tokens are billed too. Screening failures do not refund the original image request. Existing daily/monthly image-attempt quotas remain in force; there is no second image charge for retries. Exact dollar pricing was not live-verified; use current OpenAI account rates. The existing image/vision gateway fallback remains elsewhere; this new verifier never falls back to Lovable credits.

## Automated tests

`npm test`, `npx tsc --noEmit`, `npm run build`. Tests exercise text avoidance, exact phrases, signs/labels, book-display composition, capability differences, canonical-reference identity, strict screening, missing credentials, provider errors, malformed responses, opt-in high quality and zero automatic regeneration. Test providers are mocked; tests buy no images or vision calls.

## Manual visual acceptance: Claire's autumn display

This checklist is prepared, **not claimed as executed**. Do it after review/publishing, using the existing allowlisted developer photo test during a compatible library break:

1. Preview: “A casual photo of Claire's autumn book display at her school library. No specific readable titles are needed; show warm autumn details and book page edges or turned-away spines. No students, badges, private screens or identifying notices.” Confirm schedule, policy, identity reference and budget eligibility.
2. Ask her to share once through the normal pipeline. Open the actual delivered image at full size. Verify ordinary phone framing/light, a plausible autumn display, no prominent fake lettering and the established Claire identity if she appears. Check `text_quality`; `screen_passed` means model screening only. A rejection should yield no misleading photo/caption and no regeneration on retry.
3. In a separate budgeted opportunity, request one small physical display sign reading exactly **AUTUMN READS**. Confirm the model selected `text_spec`, inspect the actual sign's spelling, perspective, paper texture, shadows and focus. Reject visually if any character is wrong even when automated screening passed. Do not describe a pass until inspected.
4. Optionally compare high quality on a separately approved image attempt by setting `IMAGE_TEXT_HIGH_QUALITY=true`; do not repeatedly generate to chase a perfect result. Restore the setting afterward.

Do not use a preview alone as proof of rendered text quality. No production deployment, live generation, historical-photo edit or data reset is performed by this change.
