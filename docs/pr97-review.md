The original reference picker did not persist reviews or provide management UI. This adds an authenticated six-character Reference Library and integrates documented Hera image editing into the existing non-nude romantic photo path.

- Three independent reference roles, existing-photo inventory, lazy private previews, explicit visual approval/replacement, rejection, latest-review undo and partial readiness.
- Owner/read-state/generation-ledger provenance checks, canonical compatibility, immutable reviewed byte hashes, duplicate asset/content rejection and owner-read RLS with service-only mutations.
- Canonical sources can be bundled or private. Provider preparation copies bundled bytes privately only when needed and signs approved references server-side; no public buckets or provider signed URLs in browser responses.
- Hera `POST /v1/generate?wait=true`, 200/202 job parsing, GET polling/backoff, durable job IDs/costs, no resubmission of uncertain jobs, safe authenticated files→allowlisted-CDN redirects, bounded image validation, existing visual screening/private persistence and explicit status-only recovery.
- Separate default-off per-character opt-in, server enable flag, recent operator-confirmed credit verification and job/day/rolling-30-day spending reservations. Everyday categories keep the working provider. `mature_romantic` stays non-nude; explicit nude generation is not implemented.

**Migrations:** additive `0047_photo_reference_library.sql` and `0048_api18_generation_jobs.sql`, after 0046. Runtime-only seeding/generation is not invoked during installation. Existing messages, memories, relationships, canonical identities and media are preserved. Cost records survive conversation resets.

**Source/acceptance:** implemented against the official Hera/polling/reference links and documentation excerpts supplied by the user. Direct documentation retrieval remained blocked by this workspace's network. HTTP calls are mocked in tests; real account credit, exact CDN hostnames, live generation, production inventory, Android/PWA and billing/refunds still need staging checks. Keep this draft until live acceptance is separately authorized and completed.

**Lovable:** sync reviewed code; apply 0047 then 0048 through the normal runner; refresh Supabase types; review existing read photos in Settings → Reference Library. Configure `API18_KEY` only in Cloud Secrets. Leave `API18_ENABLED=false` initially. Set verified exact `API18_OUTPUT_HOSTS`, conservative `API18_JOB_RESERVATION_CENTS`, `API18_DAILY_BUDGET_CENTS`, `API18_MONTHLY_BUDGET_CENTS`; verify usable API credit in the dashboard and set `API18_ACCOUNT_CREDITS_VERIFIED_AT` to the actual check time (valid 24 hours). Only then enable staging and explicitly opt in per character, followed by one authorized non-nude live test. No SSH or manual production SQL.

Final validation results are recorded in `docs/api18-reference-library.md`. No production migration, paid generation, merge or deployment was performed.

**Final local validation:** 988 tests passed (55 opt-in skipped), 39 real PostgreSQL migration checks passed, TypeScript/build passed, focused lint and whitespace checks passed. A sandbox restriction initially blocked a subprocess/localhost check; rerunning with the appropriate local-test permissions passed. Remote CI and paid live acceptance are not claimed.
