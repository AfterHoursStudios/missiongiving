-- Sponsor a Woman. Each sponsorship has a hidden backing project (and its own restricted fund) so donations, receipts,
-- statements and reports show it by name with no extra reporting code.

alter table projects add column if not exists kind text not null default 'project' check (kind in ('project','sponsorship'));

create table if not exists sponsorships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id),
  slug text unique not null,
  name text not null,
  country text,
  description text,
  photo_url text,
  monthly_amount_cents bigint not null check (monthly_amount_cents >= 500 and monthly_amount_cents <= 100000),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sponsorships_status_idx on sponsorships (status, display_order);
create trigger trg_sponsorships_upd before update on sponsorships for each row execute function set_updated_at();

alter table sponsorships enable row level security;
-- Visitors may read active sponsorships. All writes go through server code (service role) after a permission check.
create policy sponsorships_public_read on sponsorships for select using (status = 'active' or has_permission('projects.manage'));
