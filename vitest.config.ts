import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest runs the pure-logic and auth/ownership unit tests under `tests/unit`.
// Prisma is mocked per-test (vi.mock("@/lib/prisma")), so no database is needed
// and the suite runs anywhere, including CI. The Playwright E2E suite under
// `tests/e2e` is excluded here and runs via its own runner (`npm run test:e2e`).
export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["tests/unit/**/*.test.ts"],
        exclude: ["tests/e2e/**", "node_modules/**"],
    },
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
});
