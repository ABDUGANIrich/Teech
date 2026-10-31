// Default: validate/list fixtures, without contacting a provider.
// Explicit live mode calls the real production prompts with synthetic data only.
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const args = process.argv.slice(2);
assert(
  args.every((arg) => arg === "--live"),
  "Only --live is supported.",
);
const cases = JSON.parse(
  await readFile(
    new URL("../tests/evals/grading-cases.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(cases.length, 3);
assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
for (const item of cases) {
  assert(
    item.answer.trim() && item.reason.trim() && item.expectedStatuses.length,
  );
  assert(
    item.expectedStatuses.every((status) =>
      ["Correct", "Partly correct", "Needs another try"].includes(status),
    ),
  );
}
console.log(
  "Validated 3 grading fixtures. Live mode also generates 1 lesson, with at most 8 completion attempts including repairs.",
);
if (!args.includes("--live")) {
  console.log(
    "No provider requests made. Use --live with OPENROUTER_API_KEY to evaluate the configured free model. Lesson clarity still requires human review.",
  );
} else {
  assert(
    process.env.OPENROUTER_API_KEY,
    "Set OPENROUTER_API_KEY before using --live.",
  );
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "vitest.eval.config.ts",
      ],
      {
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          TEECH_RUN_LIVE_EVAL: "1",
          KEENABLE_API_KEY: "",
          NEXT_PUBLIC_SUPABASE_URL: "",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
          SUPABASE_SERVICE_ROLE_KEY: "",
        },
      },
    );
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
