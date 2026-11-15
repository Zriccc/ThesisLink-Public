# Data migration and cutover

## Export format

Run `node scripts/export.js` from the old checkout environment with its existing server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` process variables. The exporter is read-only and creates `exports/migration-*.json`. It includes `users`, `theses`, `thesis_authors`, `thesis_files`, `thesis_reviews`, `notifications`, `thesis_views`, and `activity_logs`, plus an empty `account_extensions` array because the current account extensions live in Auth metadata.

Pause writes before the final export; offset pagination is not a consistent snapshot while records change. Store the export outside the document root and Git. It contains account data. It does not contain R2 file binaries or reusable user sessions.

The JSON must include arrays for all nine public/import collections, including `account_extensions`, even when empty. Auth users use the admin API representation: `app_metadata`, `user_metadata`, `created_at`, `email_confirmed_at`, and optional `identities`. A SQL dump or raw `auth.users` dump requires transformation to this JSON shape first.

## Prepare, validate, and import

Build the deployment package, create an empty MySQL database, upload the package, and complete `/setup` first. Setup imports `database/schema.sql`, creates a temporary administrator, writes the private configuration, and locks the installer.

Keep the normalized export outside the document root. Validate it before changing the database:

```text
php scripts/import.php exports/migration-EXAMPLE.json
```

Validation checks account IDs and roles, references, timestamps, thesis IDs, author order and uniqueness, file metadata, reviews, notifications, views, activity types, duplicate-warning values, and normalized duplicate hashes without inserting records.

After validation succeeds, replace the temporary setup administrator and import the production rows:

```text
php scripts/import.php exports/migration-EXAMPLE.json --apply --replace-setup-admin
```

This explicit mode requires exactly one existing administrator and no other imported application records. The export must contain at least one administrator. The setup account is deleted inside the same transaction that imports production accounts and data; any failure rolls back the deletion and preserves access through the setup administrator.

For a manually configured target that has no setup administrator, use `--apply` without the replacement flag. That mode requires every imported application table to be empty. Foreign-key or constraint failures roll back the data import. Schema DDL is installed separately and is not part of that transaction.

| Existing data | PHP/MySQL destination |
| --- | --- |
| Auth UUID/email/name/creation/verification | Explicit `users` fields; original UUIDs retained |
| Adviser/advisor role | Canonical `faculty` role |
| Student expiry/graduation/setup flags | Explicit account fields; one-year default expiry handles leap days |
| Auth extension metadata | `account_extensions` audit rows |
| Trusted Google identity subject | `users.google_subject`; Google tokens still require server verification |
| Old passwords/sessions | Password hashes omitted; fresh sign-in/reset required; no old sessions imported |
| Thesis IDs, author order, reviews, files, notifications, views, activity | Existing rows and IDs retained; timestamps converted to UTC |
| PostgreSQL duplicate comparison keys | SHA-256 hashes recomputed from PHP Unicode normalization |
| Warning arrays | Rows in `thesis_duplicate_warnings` |
| R2 bucket/object key/ETag | Preserved references; objects stay in R2 |

Supply extension history through Auth metadata or the explicit array, not both. Unsupported guest accounts, malformed metadata, missing authors, and non-ASCII R2 keys require correction or an explicit schema/mapping decision. The importer does not silently reinterpret them. Inspect exported file keys before applying. User-created account names/emails and thesis text are validated against current rules; resolve historical records that do not satisfy them before importing.

## Reconciliation and acceptance

1. Compare row counts, UUIDs, ownership, author ordering, review remarks, timestamps, extensions, notification read state, R2 keys, sizes/ETags, and historical view totals.
2. Check immediate institutional verification/reset email, queued retry through `/maintenance` and the CLI maintenance worker, Google sign-in on the exact school origin, student/faculty/admin access, temporary-password setup, student expiry and extension, single-session replacement, and logout.
3. Test actual PDF/image uploads, upload failure recovery, all duplicate warning fields, review confirmation, decline/correction/resubmission, notifications, file permissions, report PDFs, and byte-range document viewing.
4. Verify the batch approval-sheet PDF uses the actual source scans and preserves their content. It intentionally avoids OCR; verify readability of representative real images. Very large scans are rejected rather than risking excessive image-decoding memory.
5. Verify `/setup` remains locked, `/maintenance` is administrator-only, Apache serves assets but routes protected HTML through PHP, and the server has HTTPS, canonical host redirects, R2 CORS, SMTP, optional scheduled maintenance, writable private configuration, error logs, and restricted database privileges.

## Cutover and rollback

Back up the source database and Auth export. Keep the old app running until the new instance passes acceptance. Pause old writes, take and reconcile a final export, import it, provision the school domain and certificates, and then reopen writes on the new app. Decommission the old Vercel/Supabase services only after acceptance and backup checks. Cloudflare R2 remains in use.

R2 cleanup is disabled by default because the old deployment may still reference imported objects. Enable it only after confirmed cutover. SQL changes and R2 object operations are not a shared transaction; the cleanup queue provides retryable deletion after database commits.

Record post-cutover writes. A rollback after new writes resume requires reconciliation before restoring traffic to the old system. No automated command in this folder changes DNS, decommissions a service, or performs production cutover.
