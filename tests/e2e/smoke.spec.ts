import { test, expect } from "@playwright/test";

/**
 * Smoke test — confirms the app boots and serves HTML. This is the one spec the
 * scaffold ships with; it runs only when an app + DB are available (see
 * playwright.config.ts). Everything below the smoke test is a template for the
 * auth/ownership E2E flows still to be written.
 */
test("app responds and renders a document", async ({ page }) => {
    const response = await page.goto("/");
    expect(response, "expected a response from the dev server").not.toBeNull();
    expect(response!.status()).toBeLessThan(500);
    await expect(page.locator("html")).toBeVisible();
});

/**
 * Auth & ownership invariants from AGENTS.md, to be implemented end-to-end.
 * Skipped until the flows and test fixtures (seeded users, login helper) exist.
 */
test.describe.skip("auth & ownership (to implement)", () => {
    test("unauthenticated user is redirected away from a protected page", async () => {
        // TODO: goto a protected route, expect redirect to the login/setup page.
    });

    test("a user gets 403 when opening another user's chat", async () => {
        // TODO: log in as user A, request user B's chat id, expect 403.
    });

    test("a workspace MEMBER cannot perform a destructive chat action", async () => {
        // TODO: as a MEMBER, attempt delete/rename on a collaborative chat; expect denial.
        // OWNER/ADMIN on the same chat should succeed.
    });
});
