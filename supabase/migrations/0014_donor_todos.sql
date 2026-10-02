-- Donor outreach to-dos: a follow-up activity for one donor, due on a date and assigned to a staff member.
-- Shown on the donor's Contacts tab and on the assignee's admin dashboard.

create table if not exists donor_todos (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donor_profiles(id) on delete cascade,
  activity text not null check (activity in ('thank_you_call','phone_call','send_letter','send_email','meeting','follow_up','other')),
  due_date date not null,
  due_time time,
  assigned_to uuid not null references profiles(id),
  notes text check (char_length(notes) <= 2000),
  completed_at timestamptz,
  completed_by uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists donor_todos_donor_idx on donor_todos (donor_id, due_date);
create index if not exists donor_todos_open_idx on donor_todos (assigned_to, due_date) where completed_at is null;

alter table donor_todos enable row level security;
create policy donor_todos_read on donor_todos for select using (has_permission('donors.view'));
-- writes are server-only (service role)

-- Keep to-dos with the surviving record when two donors are merged.
create or replace function public.move_donor_todos_on_merge() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.merged_into is not null and old.merged_into is null then
    update donor_todos set donor_id = new.merged_into where donor_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_donor_todos_merge on donor_profiles;
create trigger trg_donor_todos_merge after update of merged_into on donor_profiles
  for each row execute function public.move_donor_todos_on_merge();
