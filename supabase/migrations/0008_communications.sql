-- Phase 6: communications campaigns

alter table communication_campaigns
  add column if not exists kind text not null default 'announcement' check (kind in ('announcement','project_update')),
  add column if not exists recipient_count int,
  add column if not exists last_error text;

alter table campaign_recipients
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists error text;
create index if not exists campaign_recipients_status_idx on campaign_recipients (campaign_id, status);
create index if not exists campaign_recipients_msg_idx on campaign_recipients (provider_message_id) where provider_message_id is not null;
create index if not exists email_events_msg_idx on email_events (provider_message_id);
create index if not exists campaigns_due_idx on communication_campaigns (status, scheduled_for);

-- Addresses that must never receive campaign mail (bounces, spam complaints, unsubscribes, manual blocks).
-- Independent of donor records so it also covers people who are not donors.
create table if not exists email_suppressions (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  reason text not null check (reason in ('bounce','complaint','unsubscribe','manual')),
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
alter table email_suppressions enable row level security;
create policy suppressions_read on email_suppressions for select using (has_permission('comms.send'));
-- writes are server-only (webhook, unsubscribe and admin actions use the service role)

-- Per-campaign engagement, counted by distinct recipient. Reachable only through server code.
create view campaign_stats as
select r.campaign_id, e.event_type, count(distinct e.recipient_id)::int as recipients
from email_events e join campaign_recipients r on r.id = e.recipient_id
group by r.campaign_id, e.event_type;
revoke all on campaign_stats from anon, authenticated;

create view campaign_recipient_status as
select campaign_id, status, count(*)::int as recipients from campaign_recipients group by campaign_id, status;
revoke all on campaign_recipient_status from anon, authenticated;
