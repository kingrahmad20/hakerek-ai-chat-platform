import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E scaffold.
 *
 * This is a starting point, NOT wired into CI yet — the real auth/ownership
 * flows require a running app plus a PostgreSQL (pgvector) database, which the
 * Vitest suite deliberately avoids. To run locally:
 *
 *   1. Ensure DATABASE_URL points at a Postgres with the `vector` extension
 *      (e.g. `docker compose up -d postgres`) and the schema is pushed
 *      (`npx prisma db push`).
 *   2. Start the app:  `npm run dev`   (or let the webServer block below do it)
 *   3. Run:            `npm run test:e2e`
 *
 * Flesh out `tests/e2e/` with real flows: unauthenticated redirect, login,
 * cross-user 403 on someone else's chat, workspace MEMBER vs OWNER modify
 * rights — i.e. the invariants in AGENTS.md, end to end.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: "list",
    use: {
        baseURL,
        trace: "on-first-retry",
    },
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ],
    // Auto-start the dev server for E2E runs. Reuses an already-running server
    // when present so you can iterate with `npm run dev` in another terminal.
    // Requires a working DATABASE_URL (see header). Set E2E_BASE_URL to point at
    // an already-deployed instance and this block is bypassed.
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
              command: "npm run dev",
              url: baseURL,
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
          },
});
