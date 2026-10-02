-- Which message template each automatic email uses (Messages → template → "Used for"). One template may be used for
-- several automatic emails (e.g. one "Thank You" for every donation); each automatic email uses at most one template.
-- With no row, the email falls back to the template whose key matches the event (the original seeded behaviour),
-- and if there is none, nothing is sent.

create table if not exists message_assignments (
  event text primary key check (event in ('donation_success_one_time','donation_success_recurring','ach_confirmed','payment_failed','recurring_canceled','refund_issued')),
  template_id uuid not null references message_templates(id) on delete cascade,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
alter table message_assignments enable row level security;
create policy message_assignments_read on message_assignments for select using (has_permission('comms.send'));
-- writes are server-only (service role)
