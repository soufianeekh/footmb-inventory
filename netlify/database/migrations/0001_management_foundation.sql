-- FOOTMB management foundation. Netlify applies this atomically before publish.
-- PostgreSQL 15+ compatible. Shopify remains authoritative for catalog, inventory,
-- orders, and completed sales; these tables store FOOTMB operational state.

create table shops (
  id uuid primary key default gen_random_uuid(),
  myshopify_domain text not null unique,
  shopify_shop_gid text,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shops_domain_format check (myshopify_domain ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'),
  constraint shops_gid_format check (shopify_shop_gid is null or shopify_shop_gid ~ '^gid://shopify/Shop/[0-9]+$')
);

create table shop_locations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  shopify_location_gid text not null,
  location_key text not null,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, shopify_location_gid),
  unique (shop_id, location_key),
  constraint shop_locations_gid_format check (shopify_location_gid ~ '^gid://shopify/Location/[0-9]+$')
);

create table app_users (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  email text not null,
  display_name text not null,
  password_hash text,
  role text not null,
  active boolean not null default true,
  shopify_staff_gid text,
  staff_link_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  unique (shop_id, email),
  constraint app_users_email_normalized check (email = lower(btrim(email))),
  constraint app_users_role check (role in ('reader', 'editor', 'admin', 'builder')),
  constraint app_users_staff_gid_format check (shopify_staff_gid is null or shopify_staff_gid ~ '^gid://shopify/StaffMember/[0-9]+$')
);

create unique index app_users_shopify_staff_unique
  on app_users (shop_id, shopify_staff_gid)
  where shopify_staff_gid is not null;

create table user_location_assignments (
  user_id uuid not null references app_users(id) on delete cascade,
  shop_id uuid not null,
  location_key text not null,
  assigned_by uuid references app_users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, location_key),
  foreign key (shop_id, location_key) references shop_locations(shop_id, location_key) on delete cascade
);

create table user_invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references app_users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index user_invitations_active_idx on user_invitations (token_hash, expires_at)
  where accepted_at is null and revoked_at is null;

create table user_permission_overrides (
  user_id uuid not null references app_users(id) on delete cascade,
  permission text not null,
  allowed boolean not null,
  granted_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, permission)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete restrict,
  actor_user_id uuid references app_users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  request_id text,
  idempotency_key text,
  outcome text not null,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint audit_logs_outcome check (outcome in ('accepted', 'completed', 'rejected', 'failed'))
);

create index audit_logs_shop_time_idx on audit_logs (shop_id, occurred_at desc);
create index audit_logs_resource_idx on audit_logs (shop_id, resource_type, resource_id, occurred_at desc);
create unique index audit_logs_idempotency_unique
  on audit_logs (shop_id, idempotency_key, action)
  where idempotency_key is not null;

create table external_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  provider text not null default 'shopify',
  provider_event_id text not null,
  topic text not null,
  resource_gid text,
  triggered_at timestamptz,
  received_at timestamptz not null default now(),
  payload_sha256 text not null,
  payload_redacted jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  expires_at timestamptz,
  unique (provider, provider_event_id),
  constraint external_events_status check (status in ('received', 'processing', 'processed', 'retry', 'dead')),
  constraint external_events_attempts check (attempts >= 0)
);

create index external_events_work_idx on external_events (status, available_at, received_at);
create index external_events_resource_idx on external_events (shop_id, resource_gid, received_at desc);

create table stock_movements (
  id uuid primary key,
  shop_id uuid not null references shops(id) on delete restrict,
  actor_user_id uuid references app_users(id) on delete set null,
  reason text not null,
  status text not null default 'pending',
  note text,
  shopify_reference_uri text,
  shopify_completed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_movements_reason check (reason in ('delivery', 'store', 'correction', 'damage', 'transfer')),
  constraint stock_movements_status check (status in ('pending', 'completed', 'failed', 'reversed'))
);

create table stock_movement_lines (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references stock_movements(id) on delete cascade,
  shopify_product_gid text not null,
  shopify_variant_gid text not null,
  shopify_inventory_item_gid text not null,
  shopify_location_gid text not null,
  product_title_snapshot text not null,
  variant_title_snapshot text not null,
  quantity_delta integer not null,
  quantity_before integer not null,
  quantity_after integer,
  created_at timestamptz not null default now(),
  unique (movement_id, shopify_inventory_item_gid, shopify_location_gid),
  constraint stock_movement_lines_negative_delta check (quantity_delta < 0)
);

create index stock_movements_shop_time_idx on stock_movements (shop_id, created_at desc);

-- Rebuildable order projection for notifications and recent dashboards. It is not
-- an accounting ledger and never replaces the authoritative Shopify order.
create table shopify_order_refs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  shopify_order_gid text not null,
  order_name text not null,
  source_name text,
  financial_status text,
  fulfillment_status text,
  cancelled_at timestamptz,
  shopify_created_at timestamptz not null,
  shopify_updated_at timestamptz not null,
  refreshed_at timestamptz not null default now(),
  unique (shop_id, shopify_order_gid)
);

create index shopify_order_refs_recent_idx on shopify_order_refs (shop_id, shopify_created_at desc);

create table customer_stock_alerts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  created_by uuid references app_users(id) on delete set null,
  assigned_to uuid references app_users(id) on delete set null,
  shopify_product_gid text not null,
  shopify_variant_gid text,
  shopify_location_gid text,
  requested_size text,
  requested_quantity integer not null default 1,
  channel text not null,
  contact_ciphertext bytea not null,
  contact_lookup_hash text not null,
  contact_hint text,
  consent_recorded_at timestamptz not null,
  status text not null default 'waiting',
  available_at timestamptz,
  notified_at timestamptz,
  resolved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_stock_alerts_quantity check (requested_quantity > 0),
  constraint customer_stock_alerts_channel check (channel in ('phone', 'whatsapp', 'email')),
  constraint customer_stock_alerts_status check (status in ('waiting', 'available', 'queued', 'notified', 'resolved', 'cancelled', 'expired'))
);

create index customer_stock_alerts_match_idx
  on customer_stock_alerts (shop_id, shopify_variant_gid, status)
  where status in ('waiting', 'available');
create index customer_stock_alerts_contact_idx on customer_stock_alerts (shop_id, contact_lookup_hash);

create table notes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  pinned boolean not null default false,
  version integer not null default 1,
  created_by uuid references app_users(id) on delete set null,
  updated_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint notes_version_positive check (version > 0)
);

create table note_revisions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references notes(id) on delete cascade,
  version integer not null,
  title text not null,
  body text not null,
  edited_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (note_id, version)
);

create index notes_shop_updated_idx on notes (shop_id, pinned desc, updated_at desc);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  resource_type text,
  resource_id text,
  source_event_id uuid references external_events(id) on delete set null,
  dedupe_key text not null,
  severity text not null default 'info',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (shop_id, dedupe_key),
  constraint notifications_severity check (severity in ('info', 'success', 'warning', 'critical'))
);

create table notification_recipients (
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  primary key (notification_id, user_id)
);

create index notification_recipients_unread_idx
  on notification_recipients (user_id, notification_id)
  where read_at is null and dismissed_at is null;

create table outbound_messages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  stock_alert_id uuid references customer_stock_alerts(id) on delete set null,
  channel text not null,
  recipient_ciphertext bytea not null,
  template_key text not null,
  template_data jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  constraint outbound_messages_channel check (channel in ('whatsapp', 'email', 'sms')),
  constraint outbound_messages_status check (status in ('pending', 'sending', 'sent', 'retry', 'failed', 'cancelled')),
  constraint outbound_messages_attempts check (attempts >= 0)
);

create index outbound_messages_work_idx on outbound_messages (status, available_at, created_at);


