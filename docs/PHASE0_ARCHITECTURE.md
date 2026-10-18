# FOOTMB Management — Phase 0 architecture and readiness audit

**Audit date:** 2026-10-18  
**Repository baseline:** `cac2a17` (`main`)  
**Scope:** architecture, security/readiness audit, an unapplied PostgreSQL schema proposal, and a behavior-preserving centralized permission policy.  
**Production impact:** none. No Shopify data was changed, no database migration was applied, and no GitHub or Netlify deployment was made.

## 1. Executive decision

Keep the current split that works well for inventory, and add a relational system of record for FOOTMB-owned operational data:

- **Shopify stays authoritative** for products, variants, collections, locations, inventory quantities, orders, refunds, fulfillments, and real sales.
- **Upstash Redis stays** as the fast inventory snapshot, global revision, webhook deduplication, distributed locks, retry queue, dead-letter queue, and short-lived cache layer.
- **PostgreSQL becomes authoritative** for app users, permission overrides, staff links, audit logs, stock-movement records, customer stock alerts, shared notes, notification state, durable event receipts, and outbound-message state.
- Use a pooled `DATABASE_URL` behind a thin repository layer. Prefer **Netlify Database** if the current Netlify credit plan supports it and its projected credits are acceptable; otherwise use **standalone Neon Postgres**. Both preserve the same PostgreSQL schema and Drizzle migration path. Netlify Database provides deploy-preview branches and migration-driven cutovers; standalone Neon can scale to zero and currently offers a free project allowance suitable for this five-user workload.
- Do not move the inventory snapshot into PostgreSQL in this phase. That would add risk without solving a current problem.

Upstash Redis is durable enough for cache and queue use, but it is not the right primary model for users, permissions, immutable audit history, customer requests, collaborative notes, or notification read state. The current JSON hashes do not provide relational constraints, foreign keys, indexed operational queries, or safe multi-record transactions.

## 2. Current application inventory

### Runtime and deployment

- Next.js `16.4.0`, React `19.3.0`, TypeScript, Auth.js `5.0.0-beta.32`.
- Netlify hosts the Next.js application and two scheduled functions.
- Upstash Redis stores the production inventory snapshot and queue state.
- Shopify Admin GraphQL targets API version `2026-10` by default.
- No relational database dependency or migration runner exists today.
- No `shopify.app.toml` or POS UI extension source exists in this repository. Shopify scopes and app versions are configured outside the repository, so the installed grant cannot be proven from source control alone.

### User-facing routes

| Route | Current behavior | Readiness |
|---|---|---|
| `/` | Dashboard with stock metrics, location distribution, availability, and low-stock products | Keep |
| `/inventory` | Searchable/filterable/paginated inventory from the Redis snapshot | Keep |
| `/inventory/[productId]` | Product detail and authorized Shopify verification/repair | Keep |
| `/pos` | Internal FOOTMB stock-removal workflow with delivery/store motive | Keep, rename its records internally to stock movements |
| `/stats` | Inventory metrics plus Shopify and internal source statistics | Keep UI; replace expensive live order scans with rebuildable projections |
| `/settings` | Sync status, diagnostics, users, roles, and logout | Keep; split staff management into its own module later |
| `/login` | Credentials authentication | Keep |

Missing product routes are staff management, customer stock alerts, shared notepad, notification inbox, and audit history.

### API routes

| Route | Protection | Purpose |
|---|---|---|
| `/api/auth/[...nextauth]` | Auth.js | Login/session lifecycle |
| `/api/inventory` | authenticated | Reads the published snapshot; initializes reconciliation if empty |
| `/api/inventory/version` | authenticated | Lightweight revision check |
| `/api/inventory/verify` | editor/admin | Re-queries and repairs one product |
| `/api/inventory/reconcile` | admin | Starts incremental reconciliation |
| `/api/inventory/diagnostics` | admin | Protected Redis/sync diagnostics |
| `/api/pos/sales` | authenticated GET; editor/admin POST | Lists and writes internal stock-removal events |
| `/api/sales/stats` | authenticated | Aggregates internal events and recent Shopify orders |
| `/api/users` | admin | Lists, creates, and deletes app users |
| `/api/webhooks/shopify` | Shopify HMAC | Receives product and inventory webhooks |
| `/api/internal/inventory/process` | timing-safe shared secret | Queue recovery and reconciliation continuation |
| `/api/inventory-preview`, `/api/test-shopify` | always 404 | Disabled legacy endpoints |

### Inventory synchronization already worth preserving

The current sync design is production-oriented:

1. The webhook route reads the raw body and checks Shopify HMAC before parsing.
2. Payload size, shop domain, topic, delivery ID, API version, and resource identity are validated.
3. Redis deduplicates by Shopify webhook delivery ID for 48 hours.
4. Work is queued before a success response and processed asynchronously with `next/after` plus scheduled recovery.
5. Events for the same resource are coalesced and the worker re-queries Shopify instead of trusting delivery order.
6. Retry backoff, visibility timeout, dead-letter handling, writer locks, and fencing protect mutations.
7. A full reconciliation writes a versioned snapshot and atomically publishes it only after validation.
8. Browser tabs poll only the revision endpoint, fetch a full snapshot only when the revision advances, pause while hidden, prevent overlapping requests, and back off after failures.

This matches Shopify's guidance to verify HMAC, deduplicate with `X-Shopify-Webhook-Id`, expect unordered/duplicate events, acknowledge within five seconds, and process long work asynchronously.

## 3. Readiness and security audit

### Strong controls already present

- All secure pages are protected by the Auth.js proxy, and sensitive API routes repeat authorization server-side.
- Credentials are bcrypt-hashed; login is rate-limited through Upstash and fails closed in production if the limiter is unavailable.
- JWT sessions are capped at eight hours and re-check the current user record.
- The webhook route uses timing-safe HMAC validation over the raw request body.
- The internal worker route uses a separate timing-safe shared secret.
- Shopify secrets stay server-side; `.env*` is ignored and only `.env.example` is tracked.
- The Shopify inventory mutation uses the required idempotency directive and `changeFromQuantity`, which provides concurrency protection.
- `npm audit --omit=dev` reports zero known production dependency vulnerabilities at the audit date.

### Gaps to close before multi-user rollout

| Priority | Finding | Required action |
|---|---|---|
| Blocker | Users and internal POS records are Redis JSON hashes, with a process-memory fallback | Move FOOTMB-owned durable entities to PostgreSQL; fail closed in production if it is unavailable |
| Blocker | No immutable audit log for stock changes, staff changes, alerts, notes, or settings | Record accepted, rejected, completed, and failed mutations with actor and idempotency key |
| High | Shopify scopes are not declared in the repository and the installed grants are not introspected | Add app configuration and a protected scope readiness check before enabling new features |
| High | Current code reads orders and writes inventory, while the existing documentation lists only read-only inventory/product/location scopes | Confirm and grant `write_inventory` and `read_orders` before relying on POS/statistics |
| High | `SaleEvent` mixes an internal stock decrement with the word “sale” | Rename the durable concept to `stock_movement`; never create a fictional Shopify order |
| High | User deletion is a hard delete and has no audit trail | Deactivate users, revoke access immediately, retain referential attribution |
| High | No field-level protection or retention policy exists for customer contact details | Encrypt contact values, hash lookup keys, minimize retention, capture consent, implement redaction |
| Medium | `/api/sales/stats` can query up to 2,500 Shopify orders on every request | Maintain a rebuildable recent order projection from webhooks and reconcile it periodically |
| Medium | Custom state-changing JSON routes do not have an explicit shared origin/CSRF guard | Add a same-origin mutation guard in addition to Auth.js session checks |
| Medium | Permissions are repeated as role comparisons in UI/API code | Use one permission registry and enforce capabilities in every server mutation |
| Medium | No CSP/security-header policy is configured in `next.config.ts` | Add CSP, frame, referrer, MIME, and permissions headers after testing Shopify embedding requirements |
| Medium | The current app is a standalone web POS, not a native Shopify POS extension | Treat native Shopify POS as a separate extension deliverable using Shopify CLI and POS targets |
| Low | Settings displays a fixed shop domain in UI source | Read display data from server configuration/shop record rather than hard-code it |

## 4. Durable database proposal

The management migration is in `netlify/database/migrations/0001_management_foundation.sql`; Netlify applies it transactionally before publishing the application version.

### Core identity

- `shops`: one row per Shopify store; normalized `myshopify_domain` and optional stable Shopify Shop GID.
- `shop_locations`: maps stable Shopify Location GIDs to FOOTMB keys (`stockCasa`, `casa`, `tanger`). Names remain display data only.
- `app_users`: FOOTMB login identity, bcrypt hash, app role, active/deactivated state, and optional verified Shopify StaffMember GID.
- `user_permission_overrides`: future per-user capability exceptions without changing the base role model.

### Operations and audit

- `audit_logs`: immutable actor/action/resource/outcome records with before/after JSON, request ID, and idempotency key.
- `stock_movements` and `stock_movement_lines`: FOOTMB operational reason and actor plus stable Shopify product, variant, inventory item, and location GIDs. The movement UUID is reused as Shopify's idempotency key.
- `shopify_order_refs`: minimal, rebuildable order projection for recent dashboards and notification state. It is explicitly not an accounting ledger.

### Collaboration and customer workflows

- `customer_stock_alerts`: requested product/variant/location/size, encrypted contact, lookup hash, consent, assignment, lifecycle, and expiry.
- `notes` and `note_revisions`: shared notepad with optimistic `version`, authorship, archive state, and edit history.
- `notifications` and `notification_recipients`: durable internal inbox, per-user read/dismiss state, severity, source resource, and dedupe key.
- `outbound_messages`: transactional outbox for approved WhatsApp/email/SMS adapters. No message is sent directly from a request handler.

### Durable event processing

- `external_events`: unique Shopify delivery ID, topic, resource GID, payload hash, redacted/minimized payload, state, retry timing, attempts, and expiry.
- Redis remains the fast queue; PostgreSQL provides the durable receipt and business transaction boundary.
- A handler transaction writes domain changes, audit log, notification/outbox rows, and marks the event processed together.

## 5. App users and Shopify staff

FOOTMB users and Shopify staff are related but not the same identity:

- Auth.js authenticates the **FOOTMB app user**. This identity controls access to this web application.
- `shopify_staff_gid` is optional attribution. It must not be used as the login key or as proof that a FOOTMB user is still authorized.
- An administrator links the records explicitly and verifies the link. Do not auto-link solely by matching email.
- A stock movement always records the FOOTMB actor. When a verified staff link exists, the audit metadata may also record the Shopify StaffMember GID.
- `read_users` is approval-gated and StaffMember access is limited to qualifying Shopify Plus or Advanced stores. Therefore the application must work fully without it. Manual app-user management is the default; staff sync is an optional enhancement.

## 6. Permission matrix

The existing roles remain `reader`, `editor`, and `admin`. The new code foundation maps them to capabilities rather than scattering role comparisons.

| Capability | Reader | Editor | Admin |
|---|:---:|:---:|:---:|
| Dashboard, inventory, statistics | View | View | View |
| POS page/history | View | View | View |
| Shopify inventory adjustment | — | Execute | Execute |
| Product verification/repair | — | Execute | Execute |
| Customer stock alerts | — | View/manage | View/manage |
| Shared notes | View | Create/edit | Create/edit/archive |
| Notifications | View/read own | View/read/manage own | Manage all |
| Staff list | — | — | View/manage/deactivate |
| Sync diagnostics/reconciliation | — | — | Manage |
| Settings | Basic/session | Basic/session | Manage |
| Audit history/export | — | — | View/export |

UI visibility is convenience only. Every read and mutation must call the server permission policy. Database queries must always include `shop_id`, and customer-contact decryption must additionally require `alerts.manage`.

## 7. Shopify access scopes and limitations

### Required for current behavior

| Scope | Why |
|---|---|
| `read_products` | Products, variants, inventory item relationships, product webhooks |
| `read_inventory` | Inventory items and levels, inventory-level webhooks |
| `read_locations` | Stable active location directory |
| `write_inventory` | `inventoryAdjustQuantities` from FOOTMB POS; this mutation also requires the installing user to have inventory permissions |
| `read_orders` | Recent sales statistics and order notifications |

`read_orders` exposes only the latest 60 days by default. `read_all_orders` requires Shopify approval and should be requested only if FOOTMB later requires history older than 60 days. The present 7/30/60-day reports do not justify it.

### Optional and intentionally deferred

| Scope | Decision |
|---|---|
| `read_users` | Optional staff linking only; approval-gated and plan-limited |
| `read_customers` | Avoid initially. Manual stock-alert contact capture does not require a Shopify customer read. Linking alerts to Shopify customers would introduce protected-customer-data review and compliance work |
| `write_orders`, `write_products`, `write_customers` | Not required and should not be requested |
| `read_all_orders` | Defer until a documented >60-day requirement exists |

Orders and customer-linked resources can contain protected customer data. Request only order identifiers, source/channel, timestamps, statuses, and line-item identifiers/quantities needed by the feature. Do not ingest addresses, payment data, or unnecessary customer fields. Public distribution would also require the mandatory `customers/data_request`, `customers/redact`, and `shop/redact` compliance webhooks.

### Native Shopify POS limitation

The existing `/pos` route is an internal responsive web workflow. Appearing inside the Shopify POS app requires a separate Shopify POS UI extension with `shopify.extension.toml`, Preact/Remote DOM targets, Shopify CLI deployment, and testing on the Shopify POS mobile/tablet app. Extension bundles have platform size and API constraints. The hosted Next.js backend remains appropriate for secrets and durable business logic.

## 8. Webhook architecture

### Keep existing inventory topics

- `inventory_levels/update`
- `inventory_levels/connect`
- `inventory_levels/disconnect`
- `products/create`
- `products/update`
- `products/delete`

### Add only when order notifications are enabled

- `orders/create`: create an internal online-order notification.
- `orders/updated`: refresh financial/fulfillment state and notification content.
- `orders/cancelled`: mark/cancel related notification actions.
- `refunds/create`: optional if refund alerts are explicitly required.

### Processing contract

1. Read raw bytes and reject oversized requests.
2. Verify HMAC before parsing or logging payload fields.
3. Validate shop, topic, delivery ID, API version, and resource ID.
4. Insert `external_events` with a unique provider delivery ID and a redacted payload/hash.
5. Enqueue only the event ID; acknowledge Shopify immediately with 2xx.
6. Claim with a lease, process idempotently, and re-query Shopify for current authoritative state.
7. In one database transaction, update the projection/workflow, create audit and notification/outbox rows, then mark the event processed.
8. Retry transient failures with bounded exponential backoff and jitter; send permanent/exhausted failures to a visible dead-letter state.
9. Reconcile inventory and recent orders periodically to recover missed deliveries.

Shopify doesn't guarantee webhook ordering and can deliver duplicates. Resource timestamps and authoritative re-fetching determine freshness; arrival order never does.

## 9. Notification architecture

### Internal staff notifications

- PostgreSQL stores the notification and per-user receipt/read state.
- Redis stores only a monotonically increasing notification revision per shop.
- Visible clients check the small revision endpoint every 30–60 seconds, pause when hidden, and fetch notifications only after the revision advances.
- Order notifications are deduplicated by shop, kind, Shopify order GID, and relevant state/version.
- The initial channel is the in-app inbox. Browser push can be added later after explicit permission and service-worker review.

### Customer stock availability

- An editor records a request with explicit consent and a preferred channel.
- Contact data is encrypted with a dedicated server-side key; a keyed lookup hash supports duplicate detection without exposing the value.
- Inventory changes evaluate only waiting alerts matching the affected variant/location.
- Availability changes the alert to `available` and creates an outbox row. A worker sends through an approved provider and records provider response/idempotency.
- Retry does not duplicate messages. Expired, cancelled, or already-notified requests do not send.
- Retention and redaction jobs remove contact data when it is no longer needed.

## 10. Migration and implementation order

1. **Phase 0 — completed locally:** readiness audit, schema proposal, centralized permission registry, tests. No runtime database connection and no deployment.
2. **Database preview foundation:** provision an isolated PostgreSQL preview, add Drizzle and a migration journal, apply `0001` only to preview, add health checks and backup/restore rehearsal.
3. **Identity migration:** seed the shop/location rows from stable configured IDs; shadow-copy Redis users preserving bcrypt hashes and IDs; validate counts/checksums; switch reads; keep the environment admin as temporary break-glass access.
4. **RBAC enforcement:** route every server operation through permission capabilities, add active-user/session revocation checks, origin protection, and audit entries.
5. **Stock movement migration:** dual-write current Redis `SaleEvent` records to PostgreSQL as stock movements, compare results, then cut reads over. Preserve UUIDs as Shopify idempotency keys.
6. **Event foundation:** add durable event receipts and transactional handlers while leaving the proven inventory Redis path intact; shadow-record inventory receipts before any cutover.
7. **Online order notifications:** obtain/verify `read_orders`, register topics, build minimal order projection and inbox behind a feature flag.
8. **Notes:** add versioned note APIs/UI with optimistic concurrency and audit logs.
9. **Stock alerts:** add encrypted contact storage, consent/retention controls, matching, and in-app availability state. Add external messaging only after provider approval.
10. **Staff management:** move the existing settings user UI to a dedicated page, use deactivation, password reset, optional Shopify staff linking, and audit history.
11. **Native POS extension:** separate Shopify CLI project/extension, dev-store testing, and staged Shopify app version release.
12. **Cleanup:** after a measured soak period, remove Redis user/sale hashes and memory fallbacks for durable entities. Keep Redis inventory/cache/queue infrastructure.

## 11. Data migration mechanics

- Migrations are append-only and run once through a journal table/tool; production never runs ad hoc schema SQL during a request.
- Import scripts are idempotent and keyed by stable current IDs/email plus shop ID.
- Redis `users` migrate to `app_users`; the environment administrator remains external until a verified admin row exists.
- Redis `sales:events` migrate to `stock_movements` and lines without changing Shopify inventory or replaying mutations.
- Every import emits counts, invalid rows, duplicate rows, and a deterministic checksum; it never logs password hashes or contact values.
- Rollback switches application reads back to Redis. PostgreSQL rows are retained for diagnosis; no reverse Shopify mutation is attempted.

## 12. Rollout gates and risks

### Gates

- Confirm installed Shopify access scopes through `currentAppInstallation.accessScopes` or Dev Dashboard.
- Confirm the shop plan before proposing `read_users`.
- Test all migrations and imports on a branch/preview database.
- Verify backup/restore and database-region latency from Netlify functions.
- Add feature flags for PostgreSQL reads, shadow writes, notifications, notes, alerts, and native POS.
- Canary with the administrator, then one editor, then the remaining staff.
- Monitor webhook p90 response time, queue age, dead letters, database errors, Redis commands, and Netlify credits.

### Material risks

- **Inventory race:** stale quantity must return a conflict and prompt a refresh; never retry with a new blind quantity.
- **Double counting:** internal stock movements are not Shopify orders and must not be added to Shopify sales totals as if they were orders.
- **Order access:** current order queries fail if `read_orders` is absent, and historical analytics stop at 60 days without approval.
- **Staff linkage:** `read_users` might be unavailable for the store plan; app roles must remain independent.
- **PII:** stock-alert contact details and order/customer fields create privacy, retention, breach, and compliance obligations.
- **Serverless connections:** use pooled/serverless PostgreSQL connections and short transactions; never create unbounded pools per request.
- **Free-tier assumptions:** quotas and pricing can change. Alert before 70/85/95% usage and define a paid-plan threshold based on measured production traffic.
- **Netlify scheduled jobs:** schedules are recovery mechanisms, not exact real-time guarantees. Webhooks stay primary.
- **Native POS:** extension release/versioning is separate from Netlify deployment and must be tested in Shopify POS.

## 13. Official references checked

- [Shopify API access scopes](https://shopify.dev/docs/api/usage/access-scopes)
- [Shopify webhooks and delivery behavior](https://shopify.dev/docs/apps/build/webhooks)
- [Shopify webhook troubleshooting and five-second timeout](https://shopify.dev/docs/apps/build/webhooks/troubleshoot)
- [Shopify inventoryAdjustQuantities](https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventoryAdjustQuantities)
- [Shopify order 60-day limitation](https://shopify.dev/docs/api/admin-graphql/latest/queries/order)
- [Shopify protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)
- [Shopify privacy-law compliance webhooks](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
- [Shopify POS UI extensions](https://shopify.dev/docs/api/pos-ui-extensions/latest)
- [Netlify Database migration workflow](https://docs.netlify.com/build/data-and-storage/netlify-database/switch-to-netlify-database/)
- [Neon compute and connection pooling](https://neon.com/docs/manage/endpoints/)

