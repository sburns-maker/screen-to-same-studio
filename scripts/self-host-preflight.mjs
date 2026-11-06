#!/usr/bin/env node
/**
 * Read-only preflight for moving Living World away from Lovable.
 * No database connections, writes, credentials, or network calls.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const ignore = new Set(["node_modules", ".git", ".output", "dist", "build", ".turbo", ".next", "coverage", "android"]);
const sources = [];
const errors = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignore.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && /\.(tsx?|jsx?|json)$/.test(entry.name) && !entry.name.endsWith(".lock")) {
      const rel = relative(root, full).replaceAll("\\", "/");
      if (rel.startsWith("src/") || rel === "vite.config.ts" || rel === "drizzle.config.ts") sources.push(rel);
    }
  }
}
if (!existsSync(join(root, "package.json"))) {
  console.error("Run from the repository root.");
  process.exit(2);
}
walk(root);
const checks = [
  { id: "lovable-vite-build", regex: /@lovable\.dev\/vite-tanstack-config/g },
  { id: "lovable-cloud-auth", regex: /@lovable\.dev\/cloud-auth-js/g },
  { id: "lovable-db-url", regex: /LOVABLE_DB_MIGRATION_URL/g },
  { id: "lovable-api-or-domain", regex: /(?:lovable\.app|lovable\.dev|lovable\.cloud)/gi },
  { id: "supabase-integration", regex: /(?:SUPABASE_URL|SUPABASE_ANON_KEY|createClient\()/g },
  { id: "background-jobs", regex: /(?:cron|schedule|backgroundTick|worldTick|setInterval)/gi },
  { id: "photo-pipeline", regex: /(?:generatePhoto|imageGeneration|photoGeneration|SPICY_API_KEY)/gi },
];
const result = { scannedFiles: sources.length, matches: {}, requiredManualChecks: [
  "Confirm latest production database backup and restore into ISOLATED destination only",
  "Verify auth users and login/OAuth redirects on new host",
  "Verify all media objects, signed URLs, uploads, and reference photos",
  "Verify OpenAI/image/voice provider secrets and budget controls",
  "Verify scheduler idempotency and no duplicate world ticks",
  "Verify messages, calls, events, pregnancy state, and photo generation",
  "Verify TLS/domain, Android launcher callback and PWA cache behavior",
  "Prove rollback to Lovable before changing live DNS or disabling Lovable",
  "Keep existing Qdrant container and volumes untouched",
]};
for (const check of checks) result.matches[check.id] = [];
for (const file of sources) {
  let content;
  try { content = readFileSync(join(root, file), "utf8"); } catch (e) { errors.push(file + ": " + e.message); continue; }
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const check of checks) {
      check.regex.lastIndex = 0;
      if (check.regex.test(lines[i])) result.matches[check.id].push({ file, line: i + 1 });
    }
  }
}
result.errors = errors;
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
