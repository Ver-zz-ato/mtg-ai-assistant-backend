-- Phase 2 safe badge additions.
-- Additive only: extend canonical badge definitions with badges backed by
-- durable server-side data that can be backfilled through sync logic.

insert into public.badge_definitions (
  id,
  name,
  description,
  icon,
  category,
  metric_key,
  target_value,
  sort_order,
  is_active,
  is_hidden
)
values
  ('salt_miner', 'Salt Miner', 'Generate 10 deck roasts', '🧂', 'tools', 'roast_count', 10, 135, true, false),
  ('social_mage', 'Social Mage', 'Create your first shareable public artifact', '🔗', 'social', 'shareable_artifact_count', 1, 138, true, false),
  ('inbox_received', 'Inbox Received', 'Receive your first comment on your content', '📥', 'social', 'inbox_received_count', 1, 139, true, false)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  category = excluded.category,
  metric_key = excluded.metric_key,
  target_value = excluded.target_value,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  is_hidden = excluded.is_hidden,
  updated_at = now();
