# RepairFlow

RepairFlow is a local-first maintenance operations platform for a small rental property team. Property managers triage and assign work, contractors quote and complete repairs, and tenants submit requests and confirm outcomes. The first release is a modular Next.js monolith backed by PostgreSQL.

## Included

- Server-session authentication with manager-issued, role-bound, single-use invitations and pending-invitation revocation
- Record-level authorization for lists, search, details, attachments, direct APIs, dashboard counts, and AI context
- Versioned work orders, quotes, and appointments with optimistic concurrency checks
- Private image uploads, transaction-backed event history, audit records, and PostgreSQL outbox jobs
- In-app notifications, an opt-in SMTP adapter, durable reminder worker, and manager retry controls
- Deterministic demo AI plus an opt-in OpenAI Responses API adapter with schema validation and human approval
- Authorized CSV exports, manager-only notes, tenant-visible messages, and record-scoped operations summaries
- Responsive manager, tenant, and contractor interfaces with real database-backed controls, including tenancy lifecycle management

Open registration, payments, multi-company tenancy, calendar sync, email intake, and automatic diagnosis are deliberately out of scope.

## Requirements

- Node.js 24 and pnpm 11
- PostgreSQL 17 or newer
- Optional: Docker Compose for PostgreSQL and Mailpit

## Local Setup

```bash
cp .env.example .env
pnpm install --frozen-lockfile
docker compose up -d postgres mailpit
pnpm prisma migrate deploy
DEMO_MODE=true pnpm prisma db seed
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). In another terminal, run the durable worker:

```bash
pnpm worker
```

Mailpit is available at [http://localhost:8025](http://localhost:8025). Set `SMTP_ENABLED=true` to send local messages to it.

### Without Docker

Create `repairflow_dev` and `repairflow_test` in an existing PostgreSQL instance, then change `DATABASE_URL` and `TEST_DATABASE_URL` in `.env`. For Postgres.app with the current macOS user this can be as simple as:

```bash
createdb repairflow_dev
createdb repairflow_test
```

No SMTP server is required when `SMTP_ENABLED=false`; in-app notifications still work.

## Demo Accounts

Demo accounts exist only after running the seed with `DEMO_MODE=true`. They all use `RepairFlow!2026` locally:

| Role | Email |
| --- | --- |
| Manager | `manager@repairflow.test` |
| Tenant A | `alex@repairflow.test` |
| Tenant B | `priya@repairflow.test` |
| Contractor | `sam@repairflow.test` |
| Second contractor | `jordan@repairflow.test` |

Never run the demo seed in a deployed environment. Production accounts should be created through a controlled initialization or manager invitation.

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
WORKER_ONCE=true pnpm worker
```

Playwright starts an isolated local app on port 3100 with its own build and upload directories. Locally, both the integration and Playwright suites read `.env` and refuse to run without `TEST_DATABASE_URL`; they never fall back to the development database. CI supplies its own isolated `DATABASE_URL`.

## AI And Email

The default `AI_PROVIDER=demo` is deterministic application-contract behavior, not a real model. To use the real adapter, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL`. Requests use server-side structured outputs, have no tools, are length/rate/time limited, and remain editable drafts.

Real email delivery is disabled by default. Configure `SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM`, then explicitly set `SMTP_ENABLED=true`. The web process and worker should use the same database and configuration.

## Container Run

The default Compose command starts only development dependencies. The optional `application` profile builds the web and worker containers and mounts a named attachment volume:

```bash
docker compose --profile application build
docker compose --profile application run --rm app pnpm prisma migrate deploy
docker compose --profile application run --rm app pnpm prisma db seed
docker compose --profile application up -d
```

This container path is delivered but was not executed in the current environment because Docker was unavailable.

## Backup And Restore

```bash
scripts/backup.sh
CONFIRM_RESTORE=yes scripts/restore.sh backups/20260911T000000Z
```

Backups contain a custom-format PostgreSQL dump and the private attachment directory. Restore destroys conflicting records in the target database; review `DATABASE_URL`, use a maintenance window, and test restores away from production first.

## Deployment Checklist

1. Provision PostgreSQL and a persistent private volume for `UPLOAD_DIR`.
2. Generate a unique `BETTER_AUTH_SECRET` and set the public HTTPS origins.
3. Leave `DEMO_MODE=false`, real SMTP disabled until approved, and secrets outside the image.
4. Run `pnpm prisma migrate deploy`, then start separate `pnpm start` and `pnpm worker` processes.
5. Configure TLS, monitoring, backups, retention policy, and a restore drill.

No public deployment, real email, or real OpenAI request was performed. See [verification](docs/VERIFICATION.md), [security](docs/SECURITY.md), and [demo guide](docs/DEMO.md).
