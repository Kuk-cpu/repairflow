# PR: Build RepairFlow First Release

## Summary

- add PostgreSQL/Prisma data model, Better Auth sessions, revocable role-bound invitations, tenancy lifecycle controls, and record-level authorization
- implement the full versioned repair workflow, private image handling, admin screens, and durable outbox notifications
- add deterministic/OpenAI AI adapters with human review, responsive role interfaces, tests, CI, Docker configuration, and operating documentation

## Verification

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:unit` (29 tests)
- PostgreSQL `pnpm test:integration` (14 tests)
- isolated Chromium `pnpm test:e2e` (2 tests)
- `pnpm build`
- manual three-role browser workflow at desktop and mobile sizes

## Review Notes

The local Playwright run passed against an isolated Next server and PostgreSQL test database. Docker, real OpenAI calls, and real SMTP delivery were not run because the required runtime or credentials were unavailable. No remote push or deployment was performed.
