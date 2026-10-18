# Phase 1 — multi-user access and staff activity

## Runtime model

- Auth.js remains the session and credentials boundary.
- PostgreSQL stores employee identities, password hashes, one-time invitations, location assignments, stock movements, and audit history.
- Shopify remains authoritative for products, variants, locations, inventory, orders, and actual sales.
- Upstash Redis remains the inventory cache, revision, lock, event queue, and short-lived POS projection layer.
- The environment-owned primary account is seeded as the protected `builder` with stable ID `00000000-0000-4000-8000-000000000001`.

## Server-enforced roles

| Capability | Builder | Admin | Éditeur | Lecteur |
| --- | --- | --- | --- | --- |
| Dashboard and inventory read | Yes | Yes | Yes | Yes |
| POS and stock adjustment | Yes | Yes | Yes | No |
| Statistics | Yes | Yes | No | No |
| Employee activity | Yes | Yes | No | No |
| Invite, disable, or change staff | Yes | No | No | No |
| System settings and sync diagnostics | Yes | No | No | No |
| Shared notes read | Yes | Yes | Yes | Yes |
| Shared notes write | Yes | Yes | Yes | No |

The UI hides unavailable routes, the proxy protects page entry, and every mutation/API performs its own permission check. Role values from request bodies are never trusted, `builder` cannot be assigned through the staff API, and the protected primary Builder cannot be disabled or changed.

## Invitation and account lifecycle

The Builder creates a user with a role, active state, and location assignments. The server creates 256 bits of random token entropy, stores only its SHA-256 hash, and returns the invitation URL once. The link expires after 48 hours. Accepting it stores a bcrypt cost-12 password hash. There is no self-registration route.

## Activity guarantees

Successful logins update `last_login_at` and append an audit record. POS writes require PostgreSQL before Shopify is called. Each operation creates a durable stock movement and audit records for initiation, confirmation, or failure, including Shopify product, variant, inventory item, location, size, quantity before, and quantity after. The current FOOTMB POS adjustment does not create a Shopify order, so its reference is `footmb://sale/<operation-id>` and its Shopify order reference remains null.

External Shopify orders are used only as Shopify sales statistics. They are not attributed to a FOOTMB user without verified evidence.

## Activation

1. Use the isolated Netlify Database branch attached to the deploy preview.
2. Run `npm run db:migrate` against preview.
3. Confirm the protected Builder row and location rows.
4. Test one invitation for each non-Builder role, including disabled-account and location rejection cases.
5. Confirm the Netlify Database connection is available to the approved production environment after review.

No migration or deployment was executed as part of this implementation.
