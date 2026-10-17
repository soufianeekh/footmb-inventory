# FOOTMB inventory synchronization

## Architecture

The authenticated UI reads a published Redis snapshot. It does not paginate Shopify during normal page loads.

1. Shopify sends a signed delivery to `/api/webhooks/shopify`.
2. The route reads the raw request body, verifies HMAC-SHA256 with `SHOPIFY_CLIENT_SECRET`, validates the shop, topic, payload size, delivery ID, and resource identifier, and atomically stores the delivery in Redis before returning `200`.
3. `next/after` attempts an immediate bounded queue drain. A Netlify scheduled function drains the same queue every minute if the immediate attempt is interrupted.
4. The worker coalesces deliveries for the same resource and re-queries Shopify. Inventory events update one inventory-item record. Product events replace only that product’s variants. A global revision increments after each atomic mutation.
5. Visible browser tabs check the lightweight revision endpoint every 12 seconds. The full snapshot is fetched only after the revision advances. Polling pauses in hidden tabs.
6. A daily reconciliation builds new versioned hashes in slices, validates pagination, and publishes the new snapshot by changing one pointer. The previous snapshot remains readable if a slice fails.

Redis keys use the `footmb:inventory:v2` namespace by default. They include the current snapshot pointer, global revision, versioned variant/item/product indexes, sync status, writer fencing lock, reconciliation cursor, ready/retry/in-flight/dead-letter queues, and 48-hour webhook delivery deduplication keys.

## Shopify configuration

The implementation targets Admin GraphQL API `2026-10`. The installed Shopify app needs these read-only scopes:

- `read_products` for products and variants and the `products/create`, `products/update`, and `products/delete` topics.
- `read_inventory` for inventory items, inventory levels, and `inventory_levels/update`, `inventory_levels/connect`, and `inventory_levels/disconnect`.
- `read_locations` for the active location directory used during reconciliation.

After changing app scopes, approve the updated scopes for the store before requesting a new client-credentials token.

Set the production environment variables from `.env.example`. Use Shopify GraphQL location IDs for the three FOOTMB locations. The current names are accepted only to discover those IDs on the first sync.

Register the exact HTTPS subscriptions after the production URL is reachable:

```powershell
$env:PUBLIC_APP_URL = "https://your-production-domain.example"
npm run shopify:webhooks
```

The script is idempotent for subscriptions with the same topic and endpoint. Shopify signs deliveries with the app client secret. Do not expose that value to the browser or place it in a public environment variable.

Official references:

- [Shopify webhook verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
- [Shopify webhook topics and scopes](https://shopify.dev/docs/api/admin-graphql/2026-10/enums/WebhookSubscriptionTopic)
- [Shopify API access scopes](https://shopify.dev/docs/api/usage/access-scopes)

## Local verification

The local adapter uses process memory when Upstash variables are absent. It supports UI and automated testing, but data resets when the development server restarts and it is not safe for production or multiple instances.

```powershell
cd "C:\Users\Soufiane\Documents\Codex\2026-10-14\the-attached-screenshots-are-the-approved\outputs\source\footmb-inventory-main"
npm install
npm test
npm run dev
```

Open `http://localhost:3000/login`. The first authenticated inventory request starts the initial reconciliation. Settings shows snapshot counts, revision state, queue depth, retries, dead letters, and whether the backend is Redis or local memory. Product details includes **Vérifier dans Shopify**, which re-queries that product and repairs its cached records if needed.

Shopify cannot send webhooks to `localhost`. Use an HTTPS tunnel and temporarily register its origin through `PUBLIC_APP_URL` for an end-to-end delivery test.

## Netlify operation

Netlify’s current Next.js adapter supports `next/after`. The repository also contains:

- `netlify/functions/process-inventory-queue.mts`: queue recovery and reconciliation resume every minute.
- `netlify/functions/reconcile-inventory.mts`: starts a full reconciliation daily at 03:17 UTC.

Scheduled functions are intentionally short. A large catalog continues from the saved cursor on later one-minute runs. No background function or paid queue is required. `/api/internal/inventory/process` is available for an external scheduler or operator and requires `INVENTORY_SYNC_SECRET` through `X-FOOTMB-SYNC-SECRET` or a Bearer token.

The Netlify Free plan currently includes 300 monthly credits. Web requests consume 2 credits per 10,000 and compute consumes 10 credits per GB-hour. Upstash Free currently includes 256 MB, 10 GB monthly bandwidth, and 500,000 monthly commands. With one administrator using the app for eight visible hours daily, 12-second revision checks account for about 72,000 web requests per month and roughly 216,000 Redis reads before page loads, webhook activity, and scheduled recovery. This fits the present free allowances for a small catalog, but the Netlify and Upstash dashboards should be watched during the first production week.

Official pricing references:

- [Netlify pricing](https://www.netlify.com/pricing/)
- [Netlify function usage](https://docs.netlify.com/build/functions/usage-and-billing/)
- [Upstash Redis pricing](https://upstash.com/pricing/redis)

## Failure handling and rollback

- Duplicate deliveries return success without entering the queue twice.
- Claimed events have a 60-second visibility timeout and are recovered if a worker stops.
- Failed events use exponential retry delays and move to a bounded dead-letter list after eight attempts.
- Shopify throttling and transient server errors use bounded exponential backoff.
- Reconciliation and incremental updates share a distributed fencing lock, so only one writer can publish.
- Shopify ordering is not trusted. Workers re-query current authoritative state, which makes delayed deliveries converge on the latest values.
- A failed full reconciliation never replaces the current snapshot. The UI reports a degraded state and continues serving the last known good data.

To roll back, restore the previous Netlify deploy, remove or retarget the six Shopify webhook subscriptions, and leave the `footmb:inventory:v2` Redis keys in place until the rollback is verified. The previous app version ignores those namespaced keys. To re-enable Phase 2, redeploy this version and run the registration script again. Avoid deleting Redis keys during rollback because they preserve the recovery snapshot and queued delivery evidence.
