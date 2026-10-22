-- The thank-you message staff picked when entering a gift by hand (Add gift → offline, or card/bank by phone or mail).
-- When set, the gift's success email uses this template instead of the automatic one. Null means the usual automatic email.

alter table donations add column if not exists thank_you_template_key text;
