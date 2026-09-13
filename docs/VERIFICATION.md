# Verification

Observed locally on 11 and 13 September 2026. A passing row means the described command or manual check completed; it is not a production certification.

| Requirement | Check | Actual result |
| --- | --- | --- |
| Tenant and contractor record isolation | PostgreSQL integration tests plus authenticated `curl` for detail/search/export/AI | Passed: anonymous `401`; other tenant and unassigned contractor `404`; cross-tenant search returned zero; tenant CSV and operations draft contained only her two records |
| Attachment isolation and file safety | Valid PNG upload, authorized/unauthorized download, SVG upload | Passed: upload `303`, owner `200 image/webp`, unauthorized `404`, SVG `415` |
| State and concurrency rules | Unit and PostgreSQL integration suites | Passed, including one winner for two stale triage submissions |
| Quote and appointment versions | PostgreSQL integration and browser workflow | Passed: new quote invalidated approval; reschedule reset both confirmations |
| Money and Sydney DST | Unit tests | Passed for integer cents and summer/winter offsets |
| Idempotency and worker recovery | PostgreSQL integration plus local worker run | Passed: one event for retried key, expired lease reclaimed once, stale reminder cancelled |
| Delayed notification staleness | PostgreSQL integration tests | Passed: superseded assignment and appointment-confirmation jobs cancel; contractor response reminder cancels after a quote |
| Dashboard totals | Integration test with more than eight records | Passed: totals use all visible records while recent list remains limited |
| AI contract and failures | 12-case evaluation plus invalid JSON/schema/timeout tests | Passed for demo/adapter contract; real model evaluation not run |
| Invitation and registration controls | Integration and direct auth API | Passed: role-bound single-use invitation, revoked invitation rejected, and open registration returned disabled `400` |
| Tenancy lifecycle | PostgreSQL integration and manager UI | Passed: concurrent link retries produce one active record and one audit; concurrent end requests have one winner; ended access blocks new requests |
| Internal notes and tenant messages | Integration test with both event visibilities | Passed: tenant saw the tenant message but not the manager-only note; tenant message created one outbox job |
| Property and asset association | Integration and UI check | Passed: a tenant can select an asset at the linked property; a cross-property asset ID is rejected server-side |
| Full three-role workflow | In-app browser interaction | Passed manually from submission through revised quote, appointment, completion, close, and reopen |
| Automated Playwright workflow | Isolated Next server, test database, and Chromium via `pnpm test:e2e` | Passed: 2/2 tests, including invitation create/revoke UI, the full three-role workflow, and attachment rejection paths |
| Restart persistence | Stop/start web server, then authorized ticket and attachment reads | Passed: both returned `200` after restart |
| Fresh migration and seed | New `repairflow_verify_20260913_concurrency` database | Passed: four migrations, then seed produced 5 users, 2 properties, 4 tickets |
| Backup and restore | Database dump plus attachment copy, restored into `repairflow_restore_20260911_61514` | Passed: restored 6 tickets, 1 attachment row, and its private file |
| Desktop/mobile visual check | In-app browser at 1280×900 and 390×844 | Passed for login, dashboard, operations draft, ticket list/detail, members, and settings; no horizontal overflow or console errors observed |
| Docker image/Compose | Docker unavailable | Configuration delivered but not executed |
| OpenAI and real SMTP | Credentials intentionally absent | Not run; deterministic demo AI and disabled SMTP were used |

## Completed Commands

```text
pnpm lint                                      pass
pnpm typecheck                                  pass
pnpm test:unit                                  5 files, 29 tests passed
pnpm test:integration                            dedicated test database selected from `.env`
                                                  1 file, 14 tests passed
pnpm test:e2e                                   2 tests passed on isolated port 3100
pnpm build                                      pass, production route manifest generated, no warnings
prisma migrate deploy + prisma db seed          pass on a fresh verification database
WORKER_ONCE=true pnpm worker                    11 due jobs sent; 3 future jobs remained pending
scripts/backup.sh + scripts/restore.sh          pass for database and private attachment data
```

The first browser pass found and corrected two defects: framework redirects were being caught as `NEXT_REDIRECT`, and tenants could close but not reopen a closed work order. Later reviews found and corrected dashboard under-counting beyond the eight-item recent list, AI API `404` mapping, PostgreSQL command/path handling in the backup scripts, stale delayed notifications after reassignment/quote/appointment changes, invalid ticket-filter handling, and inaccurate next-owner guidance.

## Remaining External Verification

- Build and start the Docker Compose `application` profile on a Docker-capable host.
- With approved credentials, run a small real-model quality evaluation and inspect messages in the intended SMTP provider.
- Perform deployment-specific TLS, backup retention, monitoring, and a restore drill against the chosen production infrastructure before use.
