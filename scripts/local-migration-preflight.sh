#!/usr/bin/env bash
# Read-only Living World local preflight. Does not start containers or disclose secrets.
set -uo pipefail
cd "$(dirname "$0")/.."
echo "===== REPOSITORY ====="
printf 'path: '; pwd
git branch --show-current
git status --short | head -80
echo "===== TOOLS ====="
for program in node bun docker git; do
  if command -v "$program" >/dev/null 2>&1; then
    printf '%s: ' "$program"
    case "$program" in
      docker) docker version --format '{{.Client.Version}} / {{.Server.Version}}' 2>&1 | head -2;;
      *) "$program" --version 2>&1 | head -1;;
    esac
  else
    echo "$program: MISSING"
  fi
done
echo "===== EXISTING REHEARSAL (READ ONLY) ====="
if command -v docker >/dev/null 2>&1; then
  docker ps -a --filter 'name=tess-private-rehearsal' --format '{{.Names}} | {{.Status}}'
  docker ps --filter 'name=sean-qdrant' --format '{{.Names}} | {{.Status}}'
fi
echo "===== PRIVATE CONFIG EXISTS (NO CONTENTS) ====="
for path in \
  deploy/self-hosted/compose.yaml \
  deploy/self-hosted/private/phase2-ready-20261026/rehearsal.env \
  docs/self-hosted-phase2-status.md \
  docs/self-hosted-migration-plan.md \
  scripts/tess-migration-workbench.py; do
  if test -f "$path"; then echo "FOUND $path"; else echo "MISSING $path"; fi
done
echo "===== SOURCE EXPORT ROOT (NAMES ONLY) ====="
for p in /mnt/e/TessMigration/source/*; do
  [ -d "$p" ] && printf '%s\n' "$p"
done
echo "===== STORAGE ====="
df -h / /mnt/c /mnt/d /mnt/e 2>/dev/null || true
echo "===== NOTES ====="
echo "No files, containers, volumes, jobs, imports, or live services were modified."
echo "This does NOT confirm that the source backup is current or that restoration is safe."
