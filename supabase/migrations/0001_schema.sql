-- Mission Giving: core schema (Phase 1)
-- All money is stored as integer minor units (cents) with an ISO currency code.
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------- helpers ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ---------- enums ----------
create type donation_status as enum ('pending','processing','succeeded','failed','refunded','partially_refunded','disputed','canceled');
create type donation_frequency as enum ('one_time','monthly','yearly');
create type payment_method_type as enum ('card','us_bank_account','offline');
create type recurring_status as enum ('active','past_due','paused','canceled','completed');
create type project_status as enum ('draft','scheduled','active','goal_reached','completed','archived');
create type tier_status as enum ('active','inactive','archived');
create type approval_status as enum ('pending','approved','rejected');
create type restriction_class as enum ('restricted','unrestricted');
create type campaign_status as enum ('draft','scheduled','sending','sent','canceled');
create type donor_status as enum ('active','inactive','lapsed','do_not_contact');

-- ---------- identity ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null,
  first_name text, last_name text, phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_profiles_upd before update on profiles for each row execute function set_updated_at();

create table donor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references profiles(id) on delete set null,
  email citext not null,
  normalized_email citext not null,
  first_name text not null, last_name text not null, phone text,
  address_line1 text, address_line2 text, city text, region text, postal_code text, country text default 'US',
  status donor_status not null default 'active',
  public_recognition boolean not null default false,
  organization_name text,          -- future-ready: household/organization affiliation
  household_id uuid,
  stripe_customer_id text unique,
  merged_into uuid references donor_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on donor_profiles (normalized_email);
create index on donor_profiles (last_name, first_name);
create trigger trg_donor_upd before update on donor_profiles for each row execute function set_updated_at();

create table staff_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_staff_upd before update on staff_profiles for each row execute function set_updated_at();

create table roles (
  id uuid primary key default gen_random_uuid(),
  key text unique not null, name text not null, description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create table permissions (
  key text primary key, description text not null
);
create table role_permissions (
  role_id uuid references roles(id) on delete cascade,
  permission_key text references permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);
create table staff_role_assignments (
  user_id uuid references staff_profiles(user_id) on delete cascade,
  role_id uuid references roles(id) on delete cascade,
  assigned_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- ---------- funds / projects / tiers ----------
create table funds (
  id uuid primary key default gen_random_uuid(),
  key text unique not null, name text not null, description text,
  restriction restriction_class not null default 'unrestricted',
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger trg_funds_upd before update on funds for each row execute function set_updated_at();

create table projects (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid references funds(id),
  slug text unique not null,
  title text not null, summary text, story_html text,
  featured_image_url text, gallery jsonb not null default '[]',
  location text,
  currency char(3) not null default 'USD',
  goal_cents bigint check (goal_cents is null or goal_cents > 0),
  offline_adjustment_cents bigint not null default 0,
  offline_adjustment_note text,
  start_date date, end_date date,
  status project_status not null default 'draft',
  featured boolean not null default false,
  is_public boolean not null default false,
  allow_custom_amount boolean not null default true,
  seo_title text, seo_description text, share_image_url text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index on projects (status, is_public);
create trigger trg_projects_upd before update on projects for each row execute function set_updated_at();

create table project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null, body_html text not null,
  published_at timestamptz, created_by uuid references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger trg_pupd_upd before update on project_updates for each row execute function set_updated_at();

create table donation_tiers (
  id uuid primary key default gen_random_uuid(),
  internal_name text not null, public_title text not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'USD',
  short_description text, impact_description text,
  confirmation_message text, email_message text,
  image_url text,
  allow_one_time boolean not null default true,
  allow_monthly boolean not null default true,
  allow_yearly boolean not null default true,
  general_fund boolean not null default true,
  project_id uuid references projects(id) on delete cascade,  -- null = not project-specific
  featured boolean not null default false,
  display_order int not null default 0,
  active_from timestamptz, active_until timestamptz,
  status tier_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on donation_tiers (status, display_order);
create trigger trg_tiers_upd before update on donation_tiers for each row execute function set_updated_at();

-- ---------- donations ----------
create sequence receipt_number_seq start 1000;

create table recurring_donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donor_profiles(id),
  fund_id uuid references funds(id), project_id uuid references projects(id),
  tier_id uuid references donation_tiers(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'USD',
  frequency donation_frequency not null check (frequency <> 'one_time'),
  status recurring_status not null default 'active',
  stripe_subscription_id text unique, stripe_customer_id text,
  next_charge_at timestamptz, canceled_at timestamptz, cancel_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on recurring_donations (donor_id);
create trigger trg_rec_upd before update on recurring_donations for each row execute function set_updated_at();

create table donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donor_profiles(id),
  fund_id uuid references funds(id), project_id uuid references projects(id),
  tier_id uuid references donation_tiers(id),
  recurring_id uuid references recurring_donations(id),
  amount_cents bigint not null check (amount_cents > 0),
  fee_cents bigint not null default 0,
  refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  currency char(3) not null default 'USD',
  frequency donation_frequency not null,
  payment_method payment_method_type not null,
  status donation_status not null default 'pending',
  is_offline boolean not null default false,
  anonymous boolean not null default false,
  donor_note text,
  idempotency_key text unique,
  stripe_payment_intent_id text unique,
  stripe_charge_id text unique,
  stripe_invoice_id text unique,
  settled_at timestamptz,
  donated_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (refunded_cents <= amount_cents)
);
create index on donations (donor_id, donated_at desc);
create index on donations (project_id) where project_id is not null;
create index on donations (status);
create trigger trg_don_upd before update on donations for each row execute function set_updated_at();

-- financial rows are never hard-deleted through the app
create or replace function public.forbid_delete() returns trigger language plpgsql as $$
begin raise exception 'Hard deletes are not permitted on %', tg_table_name; end $$;
create trigger trg_don_nodel before delete on donations for each row execute function forbid_delete();
create trigger trg_rec_nodel before delete on recurring_donations for each row execute function forbid_delete();

create table payment_methods_metadata (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donor_profiles(id),
  stripe_payment_method_id text unique not null,
  type payment_method_type not null,
  brand text, last4 char(4), exp_month int, exp_year int, bank_name text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
); -- metadata only. Never full card / bank numbers.

create table refunds (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references donations(id),
  amount_cents bigint not null check (amount_cents > 0),
  reason text, stripe_refund_id text unique,
  issued_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create table disputes (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references donations(id),
  stripe_dispute_id text unique not null,
  amount_cents bigint not null, status text not null, reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table receipts (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references donations(id),
  receipt_number text unique not null default ('MG-' || lpad(nextval('receipt_number_seq')::text, 8, '0')),
  is_final boolean not null default false,
  issued_at timestamptz not null default now(),
  last_sent_at timestamptz, delivery_history jsonb not null default '[]'
);
create unique index on receipts (donation_id);
create table annual_statements (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donor_profiles(id),
  year int not null, total_cents bigint not null,
  generated_at timestamptz not null default now(),
  unique (donor_id, year)
);
create table dedications (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null unique references donations(id),
  kind text not null check (kind in ('in_honor_of','in_memory_of')),
  name text not null, notify_email citext, message text
);

-- ---------- expenses / budgets ----------
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null, is_program boolean not null default true,
  active boolean not null default true, sort_order int not null default 0
);
create table expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null, vendor text not null, description text,
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'USD',
  category_id uuid not null references expense_categories(id),
  project_id uuid references projects(id), fund_id uuid references funds(id),
  restriction restriction_class not null default 'unrestricted',
  payment_method text, reference_number text,
  receipt_path text, notes text,
  approval approval_status not null default 'pending',
  created_by uuid references profiles(id), approved_by uuid references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index on expenses (expense_date);
create trigger trg_exp_upd before update on expenses for each row execute function set_updated_at();
create trigger trg_exp_nodel before delete on expenses for each row execute function forbid_delete();

create table budgets (
  id uuid primary key default gen_random_uuid(),
  fiscal_year int not null,
  category_id uuid references expense_categories(id), project_id uuid references projects(id),
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

-- ---------- messaging ----------
create table message_templates (
  id uuid primary key default gen_random_uuid(),
  key text unique not null, name text not null,
  subject text not null, body_html text not null, body_text text not null,
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger trg_mt_upd before update on message_templates for each row execute function set_updated_at();
create table message_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references message_templates(id) on delete cascade,
  version int not null, subject text not null, body_html text not null, body_text text not null,
  saved_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (template_id, version)
);
create table communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id),
  subject text not null, body_html text not null, body_text text,
  audience jsonb not null default '{}',
  status campaign_status not null default 'draft',
  scheduled_for timestamptz, sent_at timestamptz,
  authorized_by uuid references profiles(id), created_by uuid references profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references communication_campaigns(id) on delete cascade,
  donor_id uuid not null references donor_profiles(id),
  email citext not null, provider_message_id text, status text not null default 'queued',
  unique (campaign_id, donor_id)
);
create table email_events (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references campaign_recipients(id) on delete cascade,
  provider_message_id text, event_type text not null, occurred_at timestamptz not null default now(),
  provider_event_id text unique
);
create table communication_preferences (
  donor_id uuid primary key references donor_profiles(id) on delete cascade,
  marketing_email boolean not null default false,
  project_updates boolean not null default false,
  annual_statement_email boolean not null default true,
  suppressed boolean not null default false, suppressed_reason text,
  updated_at timestamptz not null default now()
); -- transactional receipts are independent of these flags

-- ---------- CRM ----------
create table donor_tags (
  id uuid primary key default gen_random_uuid(), name text unique not null
);
create table donor_tag_assignments (
  donor_id uuid references donor_profiles(id) on delete cascade,
  tag_id uuid references donor_tags(id) on delete cascade,
  primary key (donor_id, tag_id)
);
create table donor_notes (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donor_profiles(id) on delete cascade,
  body text not null, created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- platform ----------
create table organization_settings (
  key text primary key, value jsonb not null,
  updated_by uuid references profiles(id), updated_at timestamptz not null default now()
);
create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid, action text not null,
  entity_type text, entity_id text,
  details jsonb not null default '{}',
  ip inet, created_at timestamptz not null default now()
);
create index on audit_logs (created_at desc);
create index on audit_logs (entity_type, entity_id);
-- append-only
create or replace function public.audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_logs is append-only'; end $$;
create trigger trg_audit_noupd before update or delete on audit_logs for each row execute function audit_immutable();

create table webhook_events (
  stripe_event_id text primary key,
  type text not null,
  status text not null default 'received' check (status in ('received','processed','failed','ignored')),
  attempts int not null default 0,
  error text,               -- sanitized message only, never payload secrets
  payload jsonb,
  received_at timestamptz not null default now(), processed_at timestamptz
);
create table saved_reports (
  id uuid primary key default gen_random_uuid(),
  name text not null, report_type text not null, filters jsonb not null default '{}',
  created_by uuid references profiles(id), created_at timestamptz not null default now()
);
