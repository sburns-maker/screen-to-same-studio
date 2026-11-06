# Tess self-hosting export

Prepared November 6, 2026. This is a source handoff, not a tested, ready-to-deploy migration. The running app, conversations, scores, settings and schedules have not been changed.

## What the source archive contains

- Current tracked application source, tests, dependency lockfile, configuration and documentation.
- Bundled character portraits, canonical references and curated photos.
- Both checked-in migration folders and supplementary SQL documentation.
- The two externally hosted public avatar images, copied into `public/__l5e/assets-v1/` at the paths already used by their asset pointers, so those images do not depend on Lovable asset routing on your new host.

It deliberately excludes `.env`, secret values, repository metadata, dependencies, generated build output and private editor metadata. The existing `.env.example` is included unchanged; it is not an exhaustive or authoritative list of current settings.

## Required separate transfers

### 1. Export the live database, including accounts

In Lovable, open **More → Database → Manage → Settings → Export data**. In the Database card choose **Export → Start export**. Download the result from the emailed link or More → Storage.

This export contains the current database structure, data and user accounts with password hashes. It preserves conversations, private memories, relationship state, pregnancy records and other saved simulation state. Checked-in migrations are not a substitute for this export: some installation SQL and historical database changes may live outside a single migration history.

Limits: one export per 24 hours, database size up to 15 GB and export file up to 5 GB; the backend must be running. An export can contain highly sensitive conversation and account data. Keep it private.

Restore it into a separate, compatible backend you control. This app uses PostgreSQL plus auth, private object storage and related APIs; a plain SQL database or static website host alone is insufficient. Do not blindly run both migration folders over a restored database: there are overlapping migrations and separately documented installation steps.

### 2. Download private storage files

Open **More → Storage** and download the app's files separately, including generated photos, owner-uploaded references, approved canonical uploads and videos. Preserve bucket names and object paths, and keep private buckets private. Neither database exports nor daily database backups include storage file bytes. Reconcile storage metadata with the destination's supported restore procedure, and verify that signed-in users can read their own existing photos afterward.

### 3. Reconfigure secrets and sign-in

Secrets, sign-in provider settings and provider API keys are not exported. Re-enter credentials at your new hosting provider; never put private keys into browser configuration or source control. Lovable Cloud does not expose its service-role key or database password: create destination credentials from the backend you control rather than trying to reuse managed credentials.

The app's email/password sign-in and server access require compatible auth services. Google and Lovable sign-in currently use Lovable's Cloud Auth integration; review or replace this integration for the destination, and configure callback URLs for the new domain. Test sign-in before transferring traffic.

Direct OpenAI and SpicyAPI code exists in the source, but Lovable's AI gateway fallback is also referenced. Check which calls use which provider, supply your own supported provider credentials and retain all existing spending safeguards. Do not enable paid phone sessions as part of the move.

## Hosting requirements

The app is React with TanStack Start and server-side handlers, not a static export. Its Vite configuration uses Nitro with a Cloudflare default target. Choose a compatible deployment target for the actual host; copying a browser build to shared hosting will not run the server features.

The installed `@lovable.dev/vite-tanstack-config` README explicitly supports choosing a self-hosted target. It does not require removal solely because the host is outside Lovable. Configure and test the destination target rather than assuming the existing default runs on every host.

For local development after supplying destination configuration:

```sh
bun install --frozen-lockfile
bun run dev
```

Build with `bun run build` on the destination after selecting the deployment target. The archive has not been built or deployed on an external host, and `vite preview` is not a production hosting recipe.

Environment-variable names referenced by source can be inventoried without copying values:

```sh
rg 'process\.env|import\.meta\.env' src vite.config.ts drizzle.config.ts
```

Key configuration groups include destination browser/server auth URLs and keys, server-only privileged credentials, direct AI providers, image-provider budgets, reproductive lifecycle flags, push keys and scheduled-job authentication. Review every existing feature flag explicitly; this handoff does not change defaults or confirm secret settings.

## Scheduled jobs and cutover

World progression uses the authenticated `POST /api/public/jobs/world-tick` endpoint. Set up a scheduler outside Lovable to invoke your new HTTPS endpoint with the configured bearer secret. The repository's optional GitHub workflow and the live managed scheduler are separate mechanisms: copying workflow files does not transfer the live scheduler. Preserve the intended live cadence rather than automatically enabling every checked-in workflow.

Do not run two schedulers against two independently writable copies during cutover. Validate the destination on an isolated copy first, then coordinate a final database/storage transfer and stop the old schedule when switching. Do not change or reset simulation records to make a migration pass.

Before switching traffic verify:

- Sign-in with an existing account and correct owner-scoped access.
- Inbox, existing messages, private memories and relationship/family state read back correctly.
- Existing private photos, approved reference slots and canonical identity sources are accessible.
- A controlled message round-trip and scheduled world check work without duplicate delivery.
- Push/offline behavior works on the new HTTPS domain.
- Paid image/voice features remain governed by the existing confirmation and budget rules.

No destination provider has been selected or tested. A full move is complete only after the database, storage, credentials, authentication, server deployment and scheduler have been transferred and verified.