-- Donation form builder. A template controls the PRESENTATION of the donate flow (branding, decorative content blocks,
-- which optional donor fields to collect, which frequencies to offer, submit button copy) for a project or an email
-- campaign. It never controls the amount/payment mechanics: tiers, custom-amount limits, sponsorships, and the
-- Stripe checkout itself are unchanged and stay fully server-validated regardless of which template is shown.

create table if not exists donation_form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  -- The form used for a plain "Donate now" link with no project or campaign context. At most one row is ever true;
  -- enforced by the unique index below (a partial unique index on a constant lets Postgres enforce "at most one").
  is_default boolean not null default false,
  background_color text not null default '#f4f1ea',
  accent_color text not null default '#0f5132',
  -- Ordered decorative content blocks: [{ "type": "headline"|"section_header"|"description"|"image", ... }]
  blocks jsonb not null default '[]',
  show_phone boolean not null default true,
  show_address boolean not null default false,
  show_organization boolean not null default false,
  show_dedication boolean not null default true,
  allow_one_time boolean not null default true,
  allow_monthly boolean not null default true,
  allow_yearly boolean not null default false,
  submit_label text not null default 'Give now',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists donation_form_templates_status_idx on donation_form_templates (status);
create unique index if not exists donation_form_templates_one_default on donation_form_templates ((true)) where is_default;
create trigger trg_donation_form_templates_upd before update on donation_form_templates for each row execute function set_updated_at();

alter table donation_form_templates enable row level security;
-- The public donate page must read the active template assigned to a project or campaign. All writes are server-only
-- (service role) after a projects.manage permission check, same as donation_tiers and sponsorships.
create policy donation_form_templates_public_read on donation_form_templates for select
  using (status = 'active' or has_permission('projects.manage'));

alter table projects add column if not exists donation_form_template_id uuid references donation_form_templates(id) on delete set null;
alter table communication_campaigns add column if not exists donation_form_template_id uuid references donation_form_templates(id) on delete set null;
