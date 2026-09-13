# Project Summary

RepairFlow is a PostgreSQL-backed maintenance operations platform for a small rental property team, built as a strict TypeScript/Next.js modular monolith with role-specific workflows, durable automation, private attachments, and human-reviewed AI assistance.

- Implemented tenant, manager, and contractor workflows with record-level authorization, optimistic concurrency, versioned quotes/appointments, auditable state transitions, and integer AUD accounting.
- Built a leased PostgreSQL outbox worker with idempotent in-app notifications, stale-reminder checks, retry controls, optional SMTP, and restart recovery tests.
- Added deterministic and OpenAI-compatible structured AI adapters, human approval boundaries, private image processing, responsive UI, PostgreSQL integration tests, Playwright coverage, and GitHub Actions CI.
