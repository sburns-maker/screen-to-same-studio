# Living World migration off Lovable — November 2026

## Current verified status
- Source: `sburns-maker/screen-to-same-studio` (TanStack Start + Nitro/Vite + Supabase/Drizzle).
- Production remains on Lovable. **Do not turn it off or redirect login yet.**
- Prior local work on BurnsandBurns: WSL2 Ubuntu, Docker on `E:\\DockerData`, Node; project under `~/projects/screen-to-same-studio`.
- Earlier checks inventoried 77 tables, 86 functions, 61 media objects (~167 MB), backups, and a healthy local Supabase stack. Those checks are historical and must be repeated against the latest live state.
- Local database restore, app hosting, mail/OAuth settings and scheduler cutover were **not confirmed**.
- The `sean-qdrant` container/`sean_memory` data are separate and **must remain untouched**.

## Execution gates
1. **Inventory and backups:** Run `node scripts/self-host-preflight.mjs > migration-preflight.json` at repo root (report only; do not commit report if it includes sensitive local paths). On the PC, confirm Docker, free disk, volumes and verified current exports. Take new backups from the live database and media **before** starting migration.
2. **Build portability:** Replace Lovable-specific Vite/Nitro preset with a standalone Node server build, preserving SSR, PWA and existing routes. Check Lovable Cloud auth library, environment variables, object storage, custom AI and image provider calls, OAuth and callbacks. Do not remove Lovable dependencies blindly.
3. **Isolated restore:** Restore a copied PostgreSQL backup to a *fresh, isolated* DB/volume, preserving original exports. Restore all storage buckets and verify counts, sample attachments, and image URLs. Never restore into the running production DB.
4. **App staging:** Run the Node service against local Supabase/Auth/Storage on a private HTTPS hostname (Tailscale initially). Use new credentials only in server-side secret files; never commit them or expose postgres/admin ports.
5. **Workers:** Run a single scheduler with locks/idempotency. Validate 5-minute scheduler, 15-minute real-time tick, 30-minute per-contact minimum and job budgets against current code. Keep Lovable's job execution isolated from staging to avoid double sending.
6. **Acceptance:** Log in, send/receive messages, generate a character photo, load reference photos, run an in-person event, verify calls, notifications, pregnancy and relationship continuity, signed storage links, Android launcher sign-in and background ticks. Compare record counts and latest data.
7. **Cutover:** Freeze Lovable writes/jobs briefly, capture final incremental changes, recheck row/object counts and recent conversations, switch traffic and only then enable the new scheduler. Keep the Lovable deployment and backed-up data available for rollback until proven stable.

## Stop conditions
Do **not** cut over when the DB restore is incomplete, media is missing, auth callbacks fail, a worker could double-send, backup restoration has not been rehearsed, or rollback has not been tested.

## Immediate local read-only commands
```bash
cd ~/projects/screen-to-same-studio
git status --short
git fetch origin
node --version
docker info --format '{{.ServerVersion}}'
docker ps --format 'table {{.Names}}\t{{.Status}}'
df -h
node scripts/self-host-preflight.mjs > migration-preflight.json
```
Do not paste private tokens, database passwords or full environment files into chats/issues.

## Current code portability blockers
- `vite.config.ts` imports `@lovable.dev/vite-tanstack-config`, documented to default Nitro to Cloudflare.
- `package.json` contains `@lovable.dev/cloud-auth-js`.
- `drizzle.config.ts` reads `LOVABLE_DB_MIGRATION_URL`.
- `.env.example` documents image-provider keys but is not a complete self-hosted environment contract.

This branch provides **read-only diagnostics and a migration gate checklist**, not an operational replacement server or live database migration.
