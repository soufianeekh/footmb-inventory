# FOOTMB management database

`../netlify/database/migrations/0001_management_foundation.sql` contains the durable management schema used by Phase 1. Netlify applies migrations from that directory before publishing the matching application version.

The intended database is PostgreSQL, reached through a pooled serverless connection. Upstash Redis remains the inventory snapshot, lock, revision, deduplication, and queue layer.

Before applying the migration:

1. Use the Netlify Database preview branch created for the deploy preview.
2. Confirm Netlify has injected its database connection for the preview environment; a pooled `DATABASE_URL` remains available as an explicit local or standalone PostgreSQL override.
3. run `npm run db:migrate`; the runner uses an advisory lock and an immutable checksum journal;
4. rehearse import of Redis users and operational sale events with counts and checksums;
5. complete security and rollback review;
6. obtain explicit production approval.

The application seeds the environment-owned primary account as the protected `builder` when it first reaches the database. Employee passwords are created through one-time invitation links; only SHA-256 invitation token hashes are stored. Never expose a database connection string to the browser or commit it to Git.

