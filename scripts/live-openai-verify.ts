/**
 * Live OpenAI production-adapter verification script.
 * Exercises OpenAIProvider.extractProfile() using the real key from .env
 * to confirm the strict-schema fix works in production.
 *
 * Usage: node --import tsx scripts/live-openai-verify.ts
 * (loaded via pnpm script or direct tsx invocation)
 *
 * SECURITY: never prints/logs the API key or raw model output.
 */
import "dotenv/config";
import { OpenAIProvider } from "../src/lib/ai/openai";
import { ExtractionResult } from "../src/lib/schemas/llm-contracts";

const SAMPLE_RESUME = `Alex Morgan
alex@example.com | linkedin.com/in/alexmorgan | Tel Aviv, Israel

Senior Software Engineer at TechCorp
2020 – Present
- Led migration of monolith to microservices, reducing p99 latency 40%.
- Designed real-time event pipeline processing 50M events/day.

Software Engineer at StartupXYZ
2017 – 2020
- Built core payment infrastructure serving 200K users.
- Reduced deployment time from 2 hours to 15 minutes via CI/CD improvements.

Education
B.Sc. Computer Science, Hebrew University, 2017

Skills: TypeScript, Node.js, Go, Kubernetes, PostgreSQL, Redis`;

async function main() {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) {
    console.error("OPENAI_API_KEY not set in .env");
    process.exit(1);
  }

  console.log("Live OpenAI strict-schema verification");
  console.log("Provider: openai (production adapter)");
  console.log("Key: [present, not logged]");
  console.log("");

  const provider = new OpenAIProvider({ apiKey: key });

  // Validate key first.
  const keyCheck = await provider.validateKey();
  if (!keyCheck.ok) {
    console.error("Key validation failed:", keyCheck.message);
    process.exit(1);
  }
  console.log("Key validation: PASS");

  // Run extractProfile through the production adapter (uses strict schema).
  console.log("Running extractProfile with strict schema...");
  let result: ExtractionResult;
  try {
    result = await provider.extractProfile({ rawText: SAMPLE_RESUME });
  } catch (err) {
    console.error("extractProfile FAILED:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Validate schema.
  const parsed = ExtractionResult.safeParse(result);
  if (!parsed.success) {
    console.error("Schema validation FAILED:", parsed.error.message);
    process.exit(1);
  }

  console.log("extractProfile: PASS");
  console.log(`  Name extracted: ${result.header.name}`);
  console.log(`  Experiences: ${result.experiences.length}`);
  console.log(`  Skills (professional): ${result.skills.professional.length}`);
  console.log(`  Education entries: ${result.education.length}`);
  console.log("");
  console.log("RESULT: OpenAI strict-schema fix VERIFIED — live call succeeded.");
}

main().catch((err) => {
  console.error("Unexpected error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
