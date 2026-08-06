-- ROI Center — initial schema (location-scoped tenancy + ads/CRM cache)
-- Apply via Supabase SQL editor or `supabase db push`.

create extension if not exists "pgcrypto";

-- ─── Tenancy ─────────────────────────────────────────────────────────────────

create table if not exists agencies (
  id uuid primary key default gen_random_uuid(),
  ghl_company_id text not null unique,
  name text not null default '',
  is_active boolean not null default true,
  access_token_enc text not null default '',
  refresh_token_enc text not null default '',
  token_expires_at timestamptz,
  scope text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references agencies(id) on delete set null,
  ghl_location_id text not null unique,
  name text not null default '',
  timezone text not null default 'UTC',
  status text not null default 'active'
    check (status in ('active', 'suspended', 'trial', 'churned')),
  is_active boolean not null default true,
  ghl_user_id text not null default '',
  access_token_enc text not null default '',
  refresh_token_enc text not null default '',
  token_expires_at timestamptz,
  scope text not null default '',
  onboarded_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_locations_agency on locations(agency_id);
create index if not exists idx_locations_active on locations(is_active) where is_active;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  ghl_user_id text not null default '',
  ghl_user_type text not null default '',
  ghl_company_id text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  role text not null default 'staff'
    check (role in ('read_only', 'staff', 'manager', 'agency_admin', 'super_admin')),
  is_active boolean not null default true,
  permission_grants jsonb not null default '[]'::jsonb,
  permission_denies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, location_id)
);

create index if not exists idx_memberships_location on memberships(location_id);
create index if not exists idx_memberships_user on memberships(user_id);

-- One-time OAuth login codes (short-lived)
create table if not exists oauth_login_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ─── Meta Ads ────────────────────────────────────────────────────────────────

create table if not exists meta_ad_daily_stats (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  date date not null,
  ad_account_id text not null default '',
  impressions int not null default 0,
  clicks int not null default 0,
  spend numeric(14,2) not null default 0,
  conversions int not null default 0,
  leads int not null default 0,
  cpc numeric(14,6),
  cpm numeric(14,6),
  ctr numeric(14,6),
  reach int,
  frequency numeric(14,6),
  cost_per_conversion numeric(14,6),
  results jsonb not null default '{}'::jsonb,
  cost_per_result_breakdown jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, date)
);

create index if not exists idx_meta_daily_loc_date on meta_ad_daily_stats(location_id, date);

create table if not exists meta_campaigns (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  campaign_id text not null,
  ad_account_id text not null default '',
  name text not null default '',
  status text not null default '',
  synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, campaign_id)
);

create index if not exists idx_meta_campaigns_status on meta_campaigns(location_id, status);

create table if not exists meta_sync_states (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null unique references locations(id) on delete cascade,
  last_synced_at timestamptz,
  daily_from date,
  daily_to date,
  days_upserted int not null default 0,
  campaigns_upserted int not null default 0,
  last_error text not null default '',
  status text not null default 'idle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists meta_period_snapshots (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  impressions int not null default 0,
  clicks int not null default 0,
  spend numeric(14,2) not null default 0,
  conversions int not null default 0,
  leads int not null default 0,
  cpc numeric(14,6),
  cpm numeric(14,6),
  ctr numeric(14,6),
  cost_per_conversion numeric(14,6),
  raw_totals jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, period_start, period_end)
);

create index if not exists idx_meta_period on meta_period_snapshots(location_id, period_start, period_end);

-- ─── Google Ads ──────────────────────────────────────────────────────────────

create table if not exists google_ad_daily_stats (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  date date not null,
  customer_id text not null default '',
  impressions int not null default 0,
  clicks int not null default 0,
  spend numeric(14,2) not null default 0,
  conversions numeric(14,2) not null default 0,
  cpc numeric(14,6),
  cpm numeric(14,6),
  ctr numeric(14,6),
  cost_per_conversion numeric(14,6),
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, date)
);

create index if not exists idx_google_daily_loc_date on google_ad_daily_stats(location_id, date);

create table if not exists google_campaigns (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  campaign_id text not null,
  customer_id text not null default '',
  name text not null default '',
  status text not null default '',
  impressions int not null default 0,
  clicks int not null default 0,
  spend numeric(14,2) not null default 0,
  conversions numeric(14,2) not null default 0,
  cpc numeric(14,6),
  cpm numeric(14,6),
  ctr numeric(14,6),
  cost_per_conversion numeric(14,6),
  metrics_start date,
  metrics_end date,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, campaign_id)
);

create index if not exists idx_google_campaigns_status on google_campaigns(location_id, status);

create table if not exists google_sync_states (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null unique references locations(id) on delete cascade,
  last_synced_at timestamptz,
  daily_from date,
  daily_to date,
  days_upserted int not null default 0,
  campaigns_upserted int not null default 0,
  last_error text not null default '',
  status text not null default 'idle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists google_period_snapshots (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  impressions int not null default 0,
  clicks int not null default 0,
  spend numeric(14,2) not null default 0,
  conversions numeric(14,2) not null default 0,
  cpc numeric(14,6),
  cpm numeric(14,6),
  ctr numeric(14,6),
  cost_per_conversion numeric(14,6),
  raw_totals jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, period_start, period_end)
);

create index if not exists idx_google_period on google_period_snapshots(location_id, period_start, period_end);

-- ─── CRM / Opportunities ─────────────────────────────────────────────────────

create table if not exists roi_crm_setups (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null unique references locations(id) on delete cascade,
  pipeline_id text not null default '',
  pipeline_name text not null default '',
  setup_status text not null default 'needs_pipeline'
    check (setup_status in ('needs_pipeline', 'confirmed')),
  confirmed_at timestamptz,
  last_synced_at timestamptz,
  opportunities_synced int not null default 0,
  last_sync_error text not null default '',
  sync_status text not null default 'idle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ghl_opportunities (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  ghl_opportunity_id text not null,
  pipeline_id text not null default '',
  pipeline_stage_id text not null default '',
  pipeline_stage_name text not null default '',
  name text not null default '',
  status text not null default 'other'
    check (status in ('open', 'won', 'lost', 'abandoned', 'other')),
  status_raw text not null default '',
  monetary_value numeric(14,2) not null default 0,
  source_raw text not null default '',
  source_channel text not null default 'other'
    check (source_channel in ('facebook', 'google', 'other')),
  contact_id text not null default '',
  ghl_created_at timestamptz,
  ghl_updated_at timestamptz,
  last_status_change_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, ghl_opportunity_id)
);

create index if not exists idx_opps_loc_status_channel
  on ghl_opportunities(location_id, status, source_channel);
create index if not exists idx_opps_loc_pipeline_status
  on ghl_opportunities(location_id, pipeline_id, status);
create index if not exists idx_opps_loc_status_change
  on ghl_opportunities(location_id, last_status_change_at);
create index if not exists idx_opps_loc_created
  on ghl_opportunities(location_id, ghl_created_at);

-- ─── updated_at trigger ──────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  foreach t in array array[
    'agencies','locations','users','memberships',
    'meta_ad_daily_stats','meta_campaigns','meta_sync_states','meta_period_snapshots',
    'google_ad_daily_stats','google_campaigns','google_sync_states','google_period_snapshots',
    'roi_crm_setups','ghl_opportunities'
  ]
  loop
    execute format(
      'drop trigger if exists trg_%s_updated_at on %I; create trigger trg_%s_updated_at before update on %I for each row execute function set_updated_at();',
      t, t, t, t
    );
  end loop;
end $$;

-- ─── RLS (tenant isolation by location membership) ───────────────────────────
-- Client reads use anon key + JWT claim `location_id` (ghl) or membership check.
-- All GHL writes / syncs use service role (bypasses RLS).

alter table agencies enable row level security;
alter table locations enable row level security;
alter table users enable row level security;
alter table memberships enable row level security;
alter table oauth_login_codes enable row level security;
alter table meta_ad_daily_stats enable row level security;
alter table meta_campaigns enable row level security;
alter table meta_sync_states enable row level security;
alter table meta_period_snapshots enable row level security;
alter table google_ad_daily_stats enable row level security;
alter table google_campaigns enable row level security;
alter table google_sync_states enable row level security;
alter table google_period_snapshots enable row level security;
alter table roi_crm_setups enable row level security;
alter table ghl_opportunities enable row level security;

-- Helper: current user's location UUIDs via JWT email claim + memberships
-- App primarily uses service-role API routes; these policies protect accidental
-- anon access. JWT custom claims: request.jwt.claims ->> 'sub' = users.id

create or replace function public.user_location_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.location_id
  from memberships m
  where m.user_id = (nullif(auth.jwt() ->> 'sub', ''))::uuid
    and m.is_active = true;
$$;

-- Deny-by-default: no policies for oauth_login_codes / agencies tokens via anon.
-- Locations: members can read their locations (no token columns exposed via views preferred).

create policy locations_select_member on locations
  for select using (id in (select public.user_location_ids()));

create policy memberships_select_own on memberships
  for select using (user_id = (nullif(auth.jwt() ->> 'sub', ''))::uuid);

create policy users_select_own on users
  for select using (id = (nullif(auth.jwt() ->> 'sub', ''))::uuid);

create policy meta_daily_select on meta_ad_daily_stats
  for select using (location_id in (select public.user_location_ids()));
create policy meta_campaigns_select on meta_campaigns
  for select using (location_id in (select public.user_location_ids()));
create policy meta_sync_select on meta_sync_states
  for select using (location_id in (select public.user_location_ids()));
create policy meta_period_select on meta_period_snapshots
  for select using (location_id in (select public.user_location_ids()));

create policy google_daily_select on google_ad_daily_stats
  for select using (location_id in (select public.user_location_ids()));
create policy google_campaigns_select on google_campaigns
  for select using (location_id in (select public.user_location_ids()));
create policy google_sync_select on google_sync_states
  for select using (location_id in (select public.user_location_ids()));
create policy google_period_select on google_period_snapshots
  for select using (location_id in (select public.user_location_ids()));

create policy crm_setup_select on roi_crm_setups
  for select using (location_id in (select public.user_location_ids()));
create policy opps_select on ghl_opportunities
  for select using (location_id in (select public.user_location_ids()));

-- View without encrypted tokens for client-safe location reads
create or replace view locations_public as
select
  id,
  agency_id,
  ghl_location_id,
  name,
  timezone,
  status,
  is_active,
  onboarded_at,
  last_sync_at,
  created_at,
  updated_at
from locations;

grant select on locations_public to anon, authenticated;
