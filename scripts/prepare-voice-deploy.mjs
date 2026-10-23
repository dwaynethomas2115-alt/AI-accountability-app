import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : "/tmp/kindred-voice";
const read = (relative) => readFile(path.join(root, relative), "utf8");
const contracts = (await read("supabase/functions/_shared/voice.ts")).replace(
  'from "zod"',
  'from "npm:zod@4.6.7"',
);
const service = (await read("supabase/functions/_shared/voice-service.ts"))
  .replace(/import\s*\{[^}]*\}\s*from\s*"\.\/voice\.ts";\s*/s, "")
  .replace(/import type \{ z \} from "zod";\s*/, "");
const entry = (await read("supabase/functions/voice-session/index.ts")).replace(
  /import\s*\{[^}]*\}\s*from\s*"\.\.\/_shared\/voice-service\.ts";\s*/s,
  "",
);
await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, "index.ts"),
  `// Kindred voice-session — paste this entire file into Supabase's function editor.\n// Keep OPENAI_API_KEY in Supabase Secrets; no secret values belong in this code.\n\n${contracts}\n${service}\n${entry}`,
);
await writeFile(
  path.join(outputDir, "database-update.sql"),
  await read("supabase/migrations/202610230001_voice_plan.sql"),
);
console.log(
  `Prepared ${path.join(outputDir, "index.ts")} and database-update.sql`,
);
