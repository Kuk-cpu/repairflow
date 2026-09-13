# AI Usage During Development

Codex was used to read the supplied requirements, inspect the local environment, consult installed official documentation, implement the application, run commands, and drive browser checks. It generated code and tests, but results in `VERIFICATION.md` were recorded only after their corresponding commands or interactions completed.

## Corrections Found Through Verification

- Browser submission revealed that `redirect()` was inside `try/catch`; Next.js control exceptions appeared as `NEXT_REDIRECT`. The actions now rethrow framework control errors before formatting application failures.
- The close/reopen browser path revealed a mismatch between the visible button and the state matrix. The tenant `CLOSED → TRIAGED` rule and unit test were added.
- A final query review found dashboard totals derived from only eight recent rows. Counts now use independent authorized database queries and an integration case with more than eight records.
- Direct API review found the AI service's `NOT_FOUND` workflow error was not mapped to `404`. The route now returns the same generic result for absent and unauthorized tickets.
- Authenticated API checks confirmed that operations summaries receive only record-authorized work orders and that cross-origin requests are rejected before invoking a provider.
- A later worker review found delayed assignment, appointment, and contractor-response jobs that could become stale after workflow changes. Send-time checks and PostgreSQL integration cases were added.
- Ticket-filter review found arbitrary status strings reaching Prisma. Shared Zod validation now produces a controlled `400` API response and safe page fallback.
- Detail-page review found that `NEEDS_INFO` and pre-quote `ASSIGNED` tickets named the wrong next owner. The domain helper now includes quote and confirmation context and has focused tests.
- Turbopack warned that configurable attachment paths could trace the source tree. Runtime filesystem paths are now explicitly excluded from build tracing, and the warning-free build was rerun.
- The first real Playwright run found that an absolute attachment redirect changed `127.0.0.1` to `localhost` and dropped the session cookie. The route now returns a relative `303` location, preserving the active origin.
- Isolating Playwright from the running demo server exposed generated `.next-e2e` files to ESLint. The build directory is now separately configured and ignored by both Git and lint, while the E2E upload directory is also isolated.
- A lifecycle review found a check-then-create race in tenant/property linking. A partial unique database index, unique-conflict recovery, conditional ending, and concurrent integration assertions now keep active links and audit entries singular under retries.

## Product AI

`AI_PROVIDER=demo` was used for local checks. Its deterministic rules and 12 fixed evaluation cases prove the application contract only. They do not measure real model quality. The OpenAI adapter was tested with mocked timeout, invalid JSON, and schema-invalid responses; no external model request was made because no key/model was configured.

The implemented AI features are intentionally narrow: extract explicit intake facts, draft follow-up/progress text, and summarize only authorized records. Drafts expose source evidence and require human editing/approval. Program code computes counts, money, timeouts, permissions, and state transitions.
