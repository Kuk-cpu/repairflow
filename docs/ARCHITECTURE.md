# Architecture

RepairFlow is a modular Next.js monolith. Server Components render role-specific views; server actions and route handlers validate entry points; services enforce workflow rules; Prisma owns PostgreSQL transactions; adapters isolate AI, email, and private file storage; and a separate worker drains the PostgreSQL outbox.

## Module Map

| Area | Main paths | Responsibility |
| --- | --- | --- |
| UI | `app/(portal)`, `components` | Role-specific, responsive screens and forms |
| Entry points | `app/actions`, `app/api` | Session checks, Zod parsing, origin checks, redirects/HTTP responses |
| Data access | `data`, `lib/permissions.ts` | Minimal authorized reads and dashboard queries |
| Domain | `domain` | State matrix, prerequisites, and integer money rules |
| Services | `services` | Transactional work order, AI approval, invitation, and admin operations |
| Adapters | `ai`, `adapters` | Demo/OpenAI providers and opt-in SMTP delivery |
| Automation | `workers/outbox-worker.ts` | Leased claims, stale-state checks, retries, and notification delivery |

## Role Access Matrix

| Surface | Manager | Tenant | Contractor |
| --- | --- | --- | --- |
| List/search/dashboard | All team records | Own submitted records | Current assignments only |
| Detail/events | Full, including internal events | Own, excluding internal/contractor events | Current assignments, excluding internal/tenant events |
| Attachments/API/AI | Authorized team records | Own records | Current assignments |
| Create/triage/assign | All actions | Create for an active linked property | None |
| Quotes | Decide or waive with reason | Read | Current assignee submits revisions |
| Appointments | Schedule/reschedule | Confirm current version | Confirm current version |
| Start/complete | Observe | None | Current assignee after all prerequisites |
| Close/reopen/cancel | Close with reason; reopen/cancel | Confirm close, reopen closed work, cancel own submitted request | None |
| Members/invitations/tenancies/config/jobs | Full | None | None |

Reassignment changes `assignedContractorId` in the versioned transaction. Every subsequent list, detail, attachment, and service check uses that current value, so the previous contractor loses access immediately.

Invitation use and revocation are mutually exclusive transactionally. Tenant-property links are time-bounded records; a PostgreSQL partial unique index permits only one active link for each tenant/property pair, and conditional updates make concurrent end requests single-winner operations. After a manager ends an active link, request creation no longer accepts that property for the tenant, while historical tickets remain available under their normal record rules.

## State Matrix

| From | To | Guard |
| --- | --- | --- |
| `SUBMITTED` | `NEEDS_INFO` / `TRIAGED` | Manager confirms triage |
| `NEEDS_INFO` | `TRIAGED` | Manager after tenant adds information |
| `TRIAGED` | `ASSIGNED` | Active contractor matches property postcode |
| `ASSIGNED` | `ASSIGNED` | Manager reassigns |
| `ASSIGNED` | `SCHEDULED` | Approved quote version or manager waiver |
| `SCHEDULED` | `SCHEDULED` | Reschedule creates a new appointment version |
| `SCHEDULED` | `IN_PROGRESS` | Current contractor; quote/waiver plus both current confirmations |
| `IN_PROGRESS` | `AWAITING_CONFIRMATION` | Current contractor supplies completion notes |
| `AWAITING_CONFIRMATION` | `CLOSED` | Tenant, or manager with reason |
| `AWAITING_CONFIRMATION` / `CLOSED` | `TRIAGED` | Tenant or manager supplies reopen reason |
| Non-final state | `CANCELLED` | Manager with reason; tenant only while submitted |
| `CANCELLED` | `TRIAGED` | Manager reopens with reason |

Ticket updates use an expected version. The ticket update, event, audit entry, and outbox enqueue commit in one transaction. Quote approval belongs to a quote version; submitting a new revision supersedes an earlier approval. Appointment confirmation belongs to one appointment version; rescheduling supersedes it and queues version-specific reminders.

## AI Boundary

Only an already-authorized minimal ticket DTO is sent to a provider. Maintenance text is untrusted data. The adapter has no tools or network destinations other than the configured Responses API endpoint, caps inputs and outputs, times out, validates server-side schemas, and stores only an editable draft. Assignment, diagnosis, approval, and sending remain application actions performed by people.

## Notification Consistency

Transactions upsert outbox rows by unique business key. Workers claim due jobs with `FOR UPDATE SKIP LOCKED`, increment attempts, and reclaim leases older than 60 seconds. Before delivery they re-read ticket, assignee, status, appointment version, and contractor quote response where relevant. Superseded assignment/appointment jobs and answered response reminders are cancelled; failures back off to a maximum attempt count; managers can return terminal failures to pending.

Database uniqueness prevents duplicate jobs and in-app notifications. SMTP can still duplicate a message when the remote server accepts it but the local sent-state update fails. RepairFlow does not claim end-to-end exactly-once delivery.

## Time And Storage

Dates are stored as PostgreSQL timestamps and displayed in `Australia/Sydney`; form input is explicitly converted from Sydney time to UTC. Money is stored as integer AUD cents. Images live under private `UPLOAD_DIR`, are re-encoded to WebP, and are served only after a fresh record-level permission check.
