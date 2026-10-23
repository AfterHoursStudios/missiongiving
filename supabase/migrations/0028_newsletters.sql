-- Newsletters (Mailing/Forms → Newsletters): campaigns built from blocks in the newsletter builder. `design` holds the
-- blocks (validated by the app's newsletterDesignSchema); the email is generated from it for each recipient. Null for
-- ordinary campaigns. Newsletters go to every donor with News emails on (kind 'announcement', no audience filters).

alter table communication_campaigns add column if not exists design jsonb;
create index if not exists communication_campaigns_newsletter_idx on communication_campaigns (created_at desc) where design is not null;
