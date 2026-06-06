# Tests

Two layers:

| Layer | Runner | Location | Needs a DB? |
|---|---|---|---|
| Unit / integration | [Vitest](https://vitest.dev) | `tests/unit/` | No — the prisma singleton is mocked per-test |
| End-to-end (scaffold) | [Playwright](https://playwright.dev) | `tests/e2e/` | Yes — a running app + PostgreSQL (pgvector) |

## Vitest (default)

```bash
npm test            # run once
npm run test:watch  # watch mode
npm run test:coverage
```

The unit suite focuses on the **auth/ownership and security invariants** from
`AGENTS.md`, which are the easiest things to regress and the most damaging to get
wrong:

- `ssrf.test.ts` — `isPrivateIp` / `assertSafeUrl` block loopback, private,
  link-local, cloud-metadata, and DNS-rebinding targets ([src/lib/ssrf.ts](../src/lib/ssrf.ts)).
- `chat-access.test.ts` — owner vs. global admin vs. workspace member/OWNER/ADMIN
  read and modify rules ([src/lib/chat-access.ts](../src/lib/chat-access.ts)).
- `api-auth.test.ts` — SHA-256 bearer-token lookup, banned-user rejection,
  session fallback ([src/lib/api-auth.ts](../src/lib/api-auth.ts)).
- `rate-limit.test.ts` — sliding-window allow/reset/increment/block
  ([src/lib/rate-limit.ts](../src/lib/rate-limit.ts)).
- `pricing.test.ts` / `rag-chunk.test.ts` — pure cost and chunking helpers.

### Conventions for new unit tests

- Put files in `tests/unit/` named `*.test.ts`.
- Never hit a real database. Mock the singleton with
  `vi.mock("@/lib/prisma", () => ({ prisma: { … } }))` and stub only the queries
  the code under test calls.
- Modules that import `@/lib/auth` or NextAuth at load time should mock those too
  (see `api-auth.test.ts`) so the test stays offline.
- The `@/*` path alias resolves in tests via `vitest.config.ts`.

## Playwright (scaffold — not yet in CI)

The E2E layer is a starting point. It needs a live stack:

```bash
docker compose up -d postgres   # Postgres with the vector extension
npx prisma db push              # apply the schema
npx playwright install          # one-time: download browsers
npm run test:e2e                # starts `npm run dev` automatically
```

Point at an already-running instance instead with `E2E_BASE_URL=http://host:port npm run test:e2e`.

`smoke.spec.ts` ships with one real assertion (the app boots and serves HTML)
plus a `describe.skip` block templating the auth/ownership flows to implement
end-to-end: unauthenticated redirect, cross-user 403, and workspace
MEMBER-vs-OWNER modify rights.
