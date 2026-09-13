# Five-Minute Demo

## Prepare

```bash
docker compose up -d postgres mailpit   # or use an existing PostgreSQL instance
pnpm prisma migrate deploy
DEMO_MODE=true pnpm prisma db seed
pnpm dev
pnpm worker                             # separate terminal
```

Use the shared local password from the README.

## Normal Flow

1. Sign in as Alex and submit a request. Point out the configured emergency guidance, active-property selector, and optional private photo upload after submission.
2. Sign in as Maya. Open the request, create an explicitly labelled demo AI intake draft, edit/approve it, confirm triage, and assign Sam by postcode/trade.
3. Sign in as Sam and submit a quote. Return as Maya and request a revision. Submit version two as Sam; approve only version two as Maya.
4. Schedule an appointment in Sydney time. Confirm once as Alex and once as Sam. Show that Start work remains disabled until both confirmations and the quote prerequisite exist.
5. As Sam, start and complete work with notes and a separate actual cost. As Alex, confirm the repair, close it, then reopen with a reason. Review the versioned timeline.
6. Return to the dashboard, generate the labelled operations draft, and open one of its database-backed work order links. Export the authorized work order list from the list page.

## Useful Side Paths

- Reassign a triaged/assigned ticket, then show that the old contractor receives `404` for detail and attachment APIs.
- Reschedule an appointment and show both confirmation indicators reset.
- Ask for more information during triage, add it as the tenant, and review the event as manager.
- Add an internal manager note and a tenant-visible message, then sign in as the tenant to compare the timeline.
- Create and revoke a pending one-time invitation, maintain a contractor service profile, add a property/asset, end an active tenant-property link, and change reminder policy.
- Start the worker and open Notifications. With Mailpit enabled, inspect captured mail at `localhost:8025`.

## Error Recovery

- Submit a stale form twice: the second version receives a refresh-and-retry conflict instead of overwriting work.
- Upload an SVG: the API returns `FILE_TYPE_REJECTED`; JPEG/PNG/WebP uploads are re-encoded.
- Stop the worker, leave jobs pending, restart it, and observe PostgreSQL-backed delivery continue.
- Switch `AI_PROVIDER=openai` without credentials: the draft action reports an error and the normal manual triage form remains available.
