// Run with Node 24 and OPENAI_API_KEY securely injected. No database writes.
import { z } from "zod";
import { TEXT_MODEL, runStructured } from "../src/lib/text-ai.server.ts";

try {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const response = await fetch(`https://api.openai.com/v1/models/${TEXT_MODEL}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Model access check failed (HTTP ${response.status})`);
  const model = await response.json();
  if (model.id !== TEXT_MODEL) throw new Error("Unexpected model identifier returned");
  const result = await runStructured(
    z.object({ ready: z.literal(true) }),
    "Return ready=true.",
    "Verify structured output.",
  );
  if (!result.ready) throw new Error("Structured output check failed");
  console.info(`Verified model access and strict Responses API output: ${TEXT_MODEL}`);
} catch {
  console.error(
    "OpenAI verification failed. Check the server secret, project model access, billing, and api.openai.com connectivity. Do not activate the deployment.",
  );
  process.exitCode = 1;
}
