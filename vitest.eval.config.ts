import { defineConfig } from "vitest/config";
import base from "./vitest.config";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["tests/evals/quality.eval.ts"],
    maxWorkers: 1,
    testTimeout: 160000,
  },
});
