create extension if not exists pgcrypto;

do $$
begin
  create type app_user_role as enum ('agency_admin', 'client_editor', 'client_viewer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type source_platform as enum ('meta_ads', 'gohighlevel', 'close', 'manual_import');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type credential_status as enum ('healthy', 'expired', 'invalid', 'needs_refresh');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type connector_health as enum ('healthy', 'stale', 'partial', 'manual', 'conflicted', 'broken');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type sync_mode as enum ('rolling_window', 'full_refresh', 'manual_only');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type metric_status as enum ('select_status', 'yellow', 'green', 'red', 'light_green', 'light_red');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type exception_type as enum (
    'unmatched_identity',
    'conflicting_source_totals',
    'stale_connector',
    'expired_credentials',
    'missing_mapping',
    'manual_import_conflict',
    'post_lock_drift'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type exception_status as enum (
    'open',
    'dismissed',
    'resolved_by_override',
    'resolved_by_mapping_change',
    'reopened'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists app_users (
  id text primary key,
  name text not null,
  email text not null unique,
  google_subject text unique,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id text primary key,
  name text not null,
  reporting_timezone text not null,
  reporting_currency text not null,
  spend_basis text not null check (spend_basis in ('gross', 'net')),
  lead_definition text not null,
  new_client_definition text not null,
  pipeline_mappings jsonb not null default '{}'::jsonb,
  booking_mappings jsonb not null default '{}'::jsonb,
  revenue_mappings jsonb not null default '{}'::jsonb,
  duplicate_rules text[] not null default '{}',
  manual_import_sources text[] not null default '{}',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists client_memberships (
  client_id text not null references clients(id) on delete cascade,
  user_id text not null references app_users(id) on delete cascade,
  role app_user_role not null,
  primary key (client_id, user_id)
);

create table if not exists metric_targets (
  client_id text not null references clients(id) on delete cascade,
  metric_key text not null,
  target numeric(18,4) not null,
  owner_user_id text references app_users(id),
  primary key (client_id, metric_key)
);

create table if not exists metric_source_rules (
  client_id text not null references clients(id) on delete cascade,
  metric_key text not null,
  source_priority text[] not null,
  fallback_to_manual_import boolean not null default true,
  primary key (client_id, metric_key)
);

create table if not exists data_sources (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  source source_platform not null,
  display_name text not null,
  account_currency text not null,
  credential_status credential_status not null,
  secret_ref text not null,
  expires_at timestamptz,
  last_refresh_at timestamptz,
  last_synced_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  retry_count integer not null default 0,
  expected_max_lag_minutes integer not null,
  sync_mode sync_mode not null,
  rolling_window_days integer not null,
  requests_per_minute integer not null,
  burst_limit integer not null,
  backoff_base_ms integer not null,
  health connector_health not null
);

create table if not exists fx_rates (
  id text primary key,
  base_currency text not null,
  quote_currency text not null,
  rate numeric(18,8) not null,
  rate_date date not null,
  source text not null,
  unique (base_currency, quote_currency, rate_date)
);

create table if not exists raw_snapshots (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  source source_platform not null,
  source_record_key text not null,
  captured_at timestamptz not null,
  payload jsonb not null
);

create table if not exists normalized_facts (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  source source_platform not null,
  source_record_key text not null,
  fact_type text not null,
  occurred_at_utc timestamptz not null,
  reporting_timezone text not null,
  reporting_date_local date not null,
  value_kind text not null check (value_kind in ('count', 'currency', 'ratio')),
  value numeric(18,4) not null,
  currency_native text,
  amount_native numeric(18,4),
  currency_reporting text,
  amount_reporting numeric(18,4),
  fx_rate numeric(18,8),
  fx_rate_date date,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  funnel_id text,
  funnel_name text,
  form_id text,
  form_name text,
  calendar_id text,
  calendar_name text,
  pipeline_id text,
  pipeline_name text,
  stage_id text,
  stage_name text,
  opportunity_id text,
  owner_id text,
  owner_name text,
  contact_key text,
  external_attribution_key text,
  extra_json jsonb,
  raw_snapshot_id text not null references raw_snapshots(id),
  synced_at timestamptz not null default now(),
  reason_code text,
  import_batch_id text,
  is_deleted boolean not null default false,
  unique (client_id, source, source_record_key, fact_type)
);

create table if not exists identity_links (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  contact_key text not null,
  normalized_email_hash text,
  normalized_phone_hash text,
  meta_lead_key text,
  ghl_contact_key text,
  close_lead_key text
);

create table if not exists report_annotations (
  client_id text not null references clients(id) on delete cascade,
  report_month text not null,
  metric_key text not null,
  status metric_status not null,
  owner_user_id text references app_users(id),
  source_note text,
  risk_note text,
  manual_override_value numeric(18,4),
  override_reason text,
  updated_by text not null references app_users(id),
  updated_at timestamptz not null,
  primary key (client_id, report_month, metric_key)
);

create table if not exists report_versions (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  report_month text not null,
  locked_at timestamptz not null,
  locked_by text not null references app_users(id),
  version_number integer not null
);

create table if not exists report_version_metrics (
  report_version_id text not null references report_versions(id) on delete cascade,
  metric_key text not null,
  value numeric(18,4),
  status metric_status not null,
  owner_user_id text references app_users(id),
  source_note text,
  risk_note text,
  primary key (report_version_id, metric_key)
);

create table if not exists review_exceptions (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  report_month text,
  type exception_type not null,
  status exception_status not null,
  title text not null,
  detail text not null,
  metric_key text,
  related_source source_platform,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists manual_import_batches (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  upload_type text not null,
  file_name text not null,
  uploaded_by text not null references app_users(id),
  row_count integer not null,
  status text not null check (status in ('pending', 'completed', 'failed')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  sid varchar not null primary key,
  sess json not null,
  expire timestamptz not null
);

create index if not exists sessions_expire_idx on sessions (expire);

create index sessions_expire_idx on sessions (expire);

alter table clients enable row level security;
alter table client_memberships enable row level security;
alter table metric_targets enable row level security;
alter table metric_source_rules enable row level security;
alter table data_sources enable row level security;
alter table raw_snapshots enable row level security;
alter table normalized_facts enable row level security;
alter table identity_links enable row level security;
alter table report_annotations enable row level security;
alter table report_versions enable row level security;
alter table report_version_metrics enable row level security;
alter table review_exceptions enable row level security;
alter table manual_import_batches enable row level security;

create policy client_isolation_on_clients on clients
  using (id = current_setting('app.current_client_id', true));

create policy client_isolation_on_client_memberships on client_memberships
  using (client_id = current_setting('app.current_client_id', true));

create policy client_isolation_on_metric_targets on metric_targets
  using (client_id = current_setting('app.current_client_id', true));

create policy client_isolation_on_metric_source_rules on metric_source_rules
  using (client_id = current_setting('app.current_client_id', true));

create policy client_isolation_on_data_sources on data_sources
  using (client_id = current_setting('app.current_client_id', true));

create policy client_isolation_on_raw_snapshots on raw_snapshots
  using (client_id = current_setting('app.current_client_id', true));

create policy client_isolation_on_normalized_facts on normalized_facts
  using (client_id = current_setting('app.current_client_id', true));

create policy client_isolation_on_identity_links on identity_links
  using (client_id = current_setting('app.current_client_id', true));

create policy client_isolation_on_report_annotations on report_annotations
  using (client_id = current_setting('app.current_client_id', true));

create policy client_isolation_on_report_versions on report_versions
  using (client_id = current_setting('app.current_client_id', true));

create policy client_isolation_on_report_version_metrics on report_version_metrics
  using (
    exists (
      select 1
      from report_versions rv
      where rv.id = report_version_id
        and rv.client_id = current_setting('app.current_client_id', true)
    )
  );

create policy client_isolation_on_review_exceptions on review_exceptions
  using (client_id = current_setting('app.current_client_id', true));

create policy client_isolation_on_manual_import_batches on manual_import_batches
  using (client_id = current_setting('app.current_client_id', true));
