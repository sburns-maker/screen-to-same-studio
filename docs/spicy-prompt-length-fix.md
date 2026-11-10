# SpicyAPI prompt length repair

## Root cause

The shared `generateTessImage` path appended three overlapping instruction blocks: `buildSpicyPrompt`, `photoPersonalityPrompt`, and the full mature/suggestive category prose. Canonical identity, wardrobe, capture geometry, anatomy and safety were repeated. Requested style also appeared in the base, reference-pose instructions and personality JSON.

The previous length handling reserved room for the base and category, then blindly sliced the personality text. When base + category exceeded 5,000 characters, it threw `spicy_prompt_too_long` before sending references. This explains the reported `preflight` failure and `referenceConditioning: false`: it was not evidence that the canonical image was missing.

Measured synthetic Brooke mature request with a short couch scene:

| Block | Characters |
| --- | ---: |
| Spicy base | 3,596 |
| Personality | 2,145 |
| Mature category | 1,282 |
| Complete original | 7,025 |
| Previous room for personality | 120 |
| Complete compressed prompt | 3,174 |

The previous base/category allocation left only approximately 147 characters for scene growth before throwing, even if all personality instructions were removed. Longer scene/style instructions therefore reliably failed.

## Limits and changes

Both currently supported Seedream 5.0 Flash edit and Pro edit models use the existing provider preflight limit: **5,000 JavaScript string characters**. Assembly and `buildSpicyRequest` now use one shared model-limit registry; no provider limit was increased.

1. Assemble and validate the full prompt.
2. If oversized, perform one deterministic compression: summarize duplicate general anatomy/category/reference prose, collapse exact repeated scene sentences, and use a compact personality block.
3. Keep canonical identity, age, actual scene, wardrobe, capture details, all current continuity facts and every character-specific style/expression option. Preserve non-explicit safety, privacy and provider-authoritative moderation. Ordinary wardrobe fallback is retained only for ordinary categories.
4. Revalidate. If essential instructions still cannot fit, fail before any provider call. No blind slicing, provider fallback or category downgrade.

Diagnostics retain only original/final lengths, limit, compression outcome and final length-validation result. Selected model is already recorded alongside them. The provider passes this metadata into its existing durable job payload so asynchronous completion can retain it. No prompt content or credentials are added to diagnostics.

## Files changed

- `src/lib/spicy-prompt-budget.ts`: shared limits and deterministic compression.
- `src/lib/tess-image.server.ts`: shared assembly integration and diagnostics.
- `src/lib/spicy-image.server.ts`: request validation uses shared limits.
- `src/lib/photo-provider-router.server.ts`: carry safe budget diagnostics into submission.
- `src/lib/spicy-jobs.server.ts`: retain budget metadata for asynchronous completion.
- `src/test/spicy-prompt-budget.test.ts`: category matrix, limits, continuity and safe oversized failures.
- `src/test/spicy-prompt-flow.test.ts`: shared generation-to-provider preflight with original reference blobs.
- `src/lib/AGENTS.md`, `roadmap.md`, this report: implementation rule and status.

## Pipeline and safeguards

Manual photo tests and normal photo delivery use `generateTessImage` and `configuredPhotoProvider`; autonomous, event and scheduled photos enter the same normal delivery callback. All Spicy submissions reach `submitSpicyPhoto` and its final `buildSpicyRequest` validation before a quote or reservation. The recovery worker polls existing tasks only; it never rebuilds or resubmits a prompt. Failed preflight generations remain terminal (`retryEligible: false`). Existing action IDs, leases, atomic attachment delivery, no-duplicate retries, eligibility, consent, relationship/frequency rules and immutable canonical bytes are unchanged.

## Verification

- **234/234 focused tests passed across 11 files**, including 14 new budget/flow checks.
- Brooke and Carly ordinary, mature-romantic and suggestive long-scene reference-edit fixtures pass the actual request builder under the 5,000-character limit.
- Shared mature generation reaches a mocked Spicy provider exactly once with the original reference blob; intentionally uncompressible facts reach no provider call and produce safe terminal diagnostics.
- Existing routing, canonical integrity, eligibility/personality, identity screening and async job/duplicate-delivery tests pass.
- Wider photo suite: **485 passed, 2 failed** in 35 files before the final three flow checks were added. Failures are the previously reported Riley mature photo-lab expectation and reference-preference error-order expectation. Neither affected file was changed; no new production behavior was added to resolve those unrelated tests. A separate baseline rerun was not available.
- Latest automated application build/typecheck: **build OK**. No manual production build command was run because the environment runs builds automatically.

## Remaining limitations

No real paid image was requested or retried, no historical image/message/canonical record was changed, no secrets or database migrations were required, and nothing was published. The repaired prompt path and configured Spicy routing are verified with executable tests, not a claim of live provider acceptance. A prompt whose unique essential facts exceed the limit still fails safely rather than silently losing facts. The two wider-suite failures remain outside this fix.