import { defineConfig } from "vitest/config";
import { config as loadEnvironment } from "dotenv";

loadEnvironment({ path: ".env", quiet: true });

const integrationRun = process.argv.some((argument) => argument.includes("tests/integration"));
if (integrationRun && !process.env.CI) {
  if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for local integration tests.");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname, "server-only": `${import.meta.dirname}/tests/server-only.ts` } },
  test: { environment: "node", include: ["tests/**/*.test.ts"], coverage: { reporter: ["text", "html"], include: ["domain/**/*.ts", "ai/**/*.ts", "services/**/*.ts"] } },
});
