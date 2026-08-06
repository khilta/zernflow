-- WhatsApp was advertised on the site, offered in the channel picker and
-- already handled by the flow engine, but 00001's platform check constraint
-- never listed it, so the channel row could not be stored (issue #16).
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_platform_check;

ALTER TABLE channels ADD CONSTRAINT channels_platform_check
  CHECK (platform IN ('facebook', 'instagram', 'twitter', 'telegram', 'bluesky', 'reddit', 'whatsapp'));
