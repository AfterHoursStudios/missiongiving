-- Per-template Reply-To address (Messages → template builder). Replies to an email sent with this template go here;
-- null falls back to the organization's reply-to address in settings.
-- Email pictures are stored in the public-read "email-images" storage bucket, created by the app on first upload.

alter table message_templates add column if not exists reply_to text;
