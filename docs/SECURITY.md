# Security

## Authentication And Authorization

Better Auth provides server-side sessions and credential hashing. Open registration is disabled. Managers create 48-hour invitations whose random token is stored only as SHA-256, binds one role, and is atomically consumed once. Managers can revoke an unused invitation, and the atomic claim checks expiry, use, and revocation together. Users cannot submit role fields to registration. Deactivation removes sessions, and managers cannot deactivate their own account.

Every server action authenticates again and parses input with Zod. Route handlers read the session directly, and bounded ticket filters reject unknown status values. Record authorization is repeated for lists, search, detail, attachments, and AI context; UI visibility is not treated as enforcement. State mutations also enforce role, current assignee, status prerequisites, and optimistic ticket version. Manager-created properties, assets, invitations, invitation revocations, tenancy creation/end, configuration changes, member changes, and retry actions produce audit records.

Cookies use secure mode in production. Login is limited to five attempts per minute per Better Auth rate-limit key. State-changing custom routes require the configured same origin. Basic frame, MIME-sniffing, referrer, and browser-permission headers are set globally.

## Attachments

Only JPEG, PNG, and WebP content is accepted, regardless of supplied filename or MIME header. Files are capped by `MAX_UPLOAD_BYTES`, decoded by Sharp, rotated, resized, re-encoded to WebP, and assigned a random key. The directory is outside `public`; download looks up metadata, repeats authorization, guards the resolved path, uses `nosniff`, and disables caching.

The application writes the file before its metadata transaction. A database failure in that small interval can leave an orphan file; an operational orphan scanner is a future hardening item. Malware scanning is not included in the first release.

## AI And Untrusted Text

Descriptions are untrusted. Providers receive only a permission-filtered minimal DTO and no tools. Prompts instruct the model not to obey embedded instructions; input/output limits, timeout, per-user request limits, JSON Schema, and Zod validation provide additional boundaries. Output is always a draft. No key or full description is written to application logs.

Prompt instructions are not a security boundary by themselves. Authorization occurs before the model request, and model output cannot invoke assignment, approval, sending, files, or arbitrary networking.

## Secrets And Data

`.env` and private runtime data are ignored. `.env.example` contains placeholders only. Demo accounts and fictional addresses are created only when `DEMO_MODE=true`; never seed them in production. Define retention periods for tickets, audits, notifications, attachments, and AI drafts before a real deployment.

Database dumps and attachment archives both contain sensitive operational data. Encrypt them, restrict access, rotate them under an approved retention policy, and test restores. SMTP is at-least-once at the application boundary and can duplicate after an acknowledgement failure.

## Known Limits

- No multi-company tenant boundary; the release serves one property team.
- No MFA, SSO, antivirus scanning, object-store signed URLs, or centralized security monitoring.
- The in-process Better Auth rate-limit storage is appropriate for this local release; distributed deployment needs shared rate-limit storage.
- Security headers do not yet include a strict nonce-based Content Security Policy.
- A professional security review and deployment threat model are still required before production use.
