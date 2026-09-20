-- Seed data: FAKE / SAMPLE ONLY. No real donor information.
insert into funds (key, name, description, restriction) values
 ('general','General Fund','Supports Ultimate Mission where it is needed most.','unrestricted')
on conflict do nothing;

insert into donation_tiers (internal_name, public_title, amount_cents, short_description, impact_description, confirmation_message, email_message, display_order, featured) values
 ('Tier $10', '$10', 1000, '[PLACEHOLDER] Short description', '[PLACEHOLDER - awaiting approved impact language]', 'Thank you for your gift. [PLACEHOLDER message]', 'Thank you for your gift. [PLACEHOLDER message]', 1, false),
 ('Tier $25', '$25', 2500, '[PLACEHOLDER] Short description', '[PLACEHOLDER - awaiting approved impact language]', 'Thank you for your gift. [PLACEHOLDER message]', 'Thank you for your gift. [PLACEHOLDER message]', 2, false),
 ('Tier $50', '$50', 5000, '[PLACEHOLDER] Short description', '[PLACEHOLDER - awaiting approved impact language]', 'Thank you for your gift. [PLACEHOLDER message]', 'Thank you for your gift. [PLACEHOLDER message]', 3, true),
 ('Tier $75', '$75', 7500, '[PLACEHOLDER] Short description', '[PLACEHOLDER - awaiting approved impact language]', 'Thank you for your gift. [PLACEHOLDER message]', 'Thank you for your gift. [PLACEHOLDER message]', 4, false),
 ('Tier $100', '$100', 10000, '[PLACEHOLDER] Short description', '[PLACEHOLDER - awaiting approved impact language]', 'Thank you for your gift. [PLACEHOLDER message]', 'Thank you for your gift. [PLACEHOLDER message]', 5, false);

insert into expense_categories (name, is_program, sort_order) values
 ('Program Services', true, 1), ('Fundraising', false, 2), ('Management & General', false, 3),
 ('Payment Processing Fees', false, 4), ('Travel', true, 5), ('Supplies', true, 6);

insert into message_templates (key, name, subject, body_html, body_text) values
 ('account_verification','Account verification','Verify your {{organization_name}} account','<p>Hello {{donor_first_name}}, please verify your email.</p>','Hello {{donor_first_name}}, please verify your email.'),
 ('welcome','Welcome email','Welcome to {{organization_name}}','<p>Welcome, {{donor_first_name}}.</p>','Welcome, {{donor_first_name}}.'),
 ('donation_success_one_time','Successful one-time donation','Thank you for your gift, {{donor_first_name}}','<p>We received your {{donation_amount}} gift. Receipt {{receipt_number}}.</p>','We received your {{donation_amount}} gift. Receipt {{receipt_number}}.'),
 ('donation_success_recurring','Successful recurring donation','Thank you for your {{donation_frequency}} gift','<p>Your {{donation_amount}} {{donation_frequency}} gift was received.</p>','Your {{donation_amount}} {{donation_frequency}} gift was received.'),
 ('ach_pending','Pending ACH donation','Your bank payment is pending','<p>Your ACH payment of {{donation_amount}} is pending. It is not final until it settles.</p>','Your ACH payment of {{donation_amount}} is pending. It is not final until it settles.'),
 ('ach_confirmed','ACH payment confirmed','Your bank payment was confirmed','<p>Your {{donation_amount}} payment settled. Receipt {{receipt_number}}.</p>','Your {{donation_amount}} payment settled. Receipt {{receipt_number}}.'),
 ('payment_failed','Failed payment','Your payment could not be completed','<p>Your {{donation_amount}} payment failed. No gift was recorded.</p>','Your {{donation_amount}} payment failed. No gift was recorded.'),
 ('recurring_reminder','Recurring payment reminder','Upcoming {{donation_frequency}} gift','<p>Your gift of {{donation_amount}} will process soon.</p>','Your gift of {{donation_amount}} will process soon.'),
 ('recurring_canceled','Recurring donation canceled','Your recurring gift was canceled','<p>Your recurring gift was canceled.</p>','Your recurring gift was canceled.'),
 ('refund_issued','Refund issued','A refund was issued','<p>A refund for {{donation_amount}} was issued.</p>','A refund for {{donation_amount}} was issued.'),
 ('annual_statement','Annual giving statement','Your annual giving statement','<p>Your statement is ready: {{dashboard_link}}</p>','Your statement is ready: {{dashboard_link}}'),
 ('project_announcement','Project announcement','New project: {{project_name}}','<p>{{project_name}} has launched.</p>','{{project_name}} has launched.'),
 ('project_update','Project update','Update on {{project_name}}','<p>News from {{project_name}}.</p>','News from {{project_name}}.'),
 ('project_goal_reached','Project goal reached','{{project_name}} reached its goal','<p>Thanks to you, {{project_name}} reached its goal.</p>','Thanks to you, {{project_name}} reached its goal.');
-- Sample donors/donations are created by `npm run seed:sample` (scripts/seed-sample.ts, added in Phase 2)
-- so they can be labeled and removed cleanly.
