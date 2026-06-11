-- Marketing Radar phase 2: source fetch metadata, draft calendar/export/quality, ingestion seeds.

-- ---------------------------------------------------------------------------
-- marketing_sources: fetch tracking + metadata
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketing_sources
  ADD COLUMN IF NOT EXISTS last_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS fetch_error text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- marketing_drafts: calendar, export, quality, supersede
-- ---------------------------------------------------------------------------
ALTER TABLE public.marketing_drafts
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS campaign text,
  ADD COLUMN IF NOT EXISTS copied_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_post_url text,
  ADD COLUMN IF NOT EXISTS quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

ALTER TABLE public.marketing_drafts DROP CONSTRAINT IF EXISTS marketing_drafts_status_check;
ALTER TABLE public.marketing_drafts
  ADD CONSTRAINT marketing_drafts_status_check
  CHECK (status IN ('draft', 'approved', 'rejected', 'superseded'));

CREATE INDEX IF NOT EXISTS idx_marketing_drafts_brief_superseded
  ON public.marketing_drafts (brief_id, superseded_at);

CREATE INDEX IF NOT EXISTS idx_marketing_drafts_scheduled_for
  ON public.marketing_drafts (scheduled_for)
  WHERE scheduled_for IS NOT NULL;

-- ---------------------------------------------------------------------------
-- marketing_signals: URL dedupe helper index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_marketing_signals_url
  ON public.marketing_signals (url)
  WHERE url IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RSS sources
-- ---------------------------------------------------------------------------
INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'rss', 'MTG Official News', 'https://magic.wizards.com/en/rss/news', true,
  '{"priority": 1, "category": "official"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.marketing_sources WHERE type = 'rss' AND name = 'MTG Official News'
);

INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'rss', 'EDHREC Articles', 'https://edhrec.com/articles/feed/', true,
  '{"priority": 2, "category": "commander"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.marketing_sources WHERE type = 'rss' AND name = 'EDHREC Articles'
);

INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'rss', 'MTGGoldfish Articles', 'https://www.mtggoldfish.com/articles/feed', true,
  '{"priority": 2, "category": "meta"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.marketing_sources WHERE type = 'rss' AND name = 'MTGGoldfish Articles'
);

INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'rss', 'Commanders Herald', 'https://commandersherald.com/feed/', false,
  '{"priority": 3, "category": "commander", "disabled_reason": "Verify RSS URL before enabling"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.marketing_sources WHERE type = 'rss' AND name = 'Commanders Herald'
);

INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'rss', 'Wizards MTG Articles', 'https://magic.wizards.com/en/rss/articles', false,
  '{"priority": 2, "disabled_reason": "Feed may 404; enable after verification"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.marketing_sources WHERE type = 'rss' AND name = 'Wizards MTG Articles'
);

-- ---------------------------------------------------------------------------
-- YouTube channels (curated defaults — edit channelId in Supabase if needed)
-- ---------------------------------------------------------------------------
INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'youtube_channel', 'The Command Zone', 'https://www.youtube.com/@commandcast',
  true, '{"channelId": "UCJ6DjTd3JNKBF20q6XEhabw", "channelName": "The Command Zone", "handle": "@commandcast", "priority": 1}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_sources WHERE type = 'youtube_channel' AND name = 'The Command Zone');

INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'youtube_channel', 'Tolarian Community College', 'https://www.youtube.com/@tolariancommunitycollege',
  true, '{"channelId": "UCCTES0XlQ4AaweYQYIOOQ", "channelName": "Tolarian Community College", "handle": "@tolariancommunitycollege", "priority": 1}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_sources WHERE type = 'youtube_channel' AND name = 'Tolarian Community College');

INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'youtube_channel', 'MTGGoldfish', 'https://www.youtube.com/@mtggoldfish',
  true, '{"channelId": "UCdcQNBFus4XwWAsninCrLw", "channelName": "MTGGoldfish", "handle": "@mtggoldfish", "priority": 2}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_sources WHERE type = 'youtube_channel' AND name = 'MTGGoldfish');

INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'youtube_channel', 'EDHREC', 'https://www.youtube.com/@edhrec',
  true, '{"channelId": "UCQZ30Qp4a5Y0e0YqJQWQ", "channelName": "EDHREC", "handle": "@edhrec", "priority": 2}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_sources WHERE type = 'youtube_channel' AND name = 'EDHREC');

INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'youtube_channel', 'Nitrogen', 'https://www.youtube.com/@NitrogenMTG',
  false, '{"channelId": "", "channelName": "Nitrogen", "handle": "@NitrogenMTG", "priority": 3, "disabled_reason": "Set channelId in metadata then enable"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_sources WHERE type = 'youtube_channel' AND name = 'Nitrogen');

-- ---------------------------------------------------------------------------
-- Reddit subreddits (read-only signal analysis)
-- ---------------------------------------------------------------------------
INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'reddit_subreddit', 'r/EDH', 'https://www.reddit.com/r/EDH/', true,
  '{"subreddit": "EDH", "sort": "hot", "limit": 25, "priority": 1}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_sources WHERE type = 'reddit_subreddit' AND name = 'r/EDH');

INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'reddit_subreddit', 'r/magicTCG', 'https://www.reddit.com/r/magicTCG/', true,
  '{"subreddit": "magicTCG", "sort": "hot", "limit": 25, "priority": 1}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_sources WHERE type = 'reddit_subreddit' AND name = 'r/magicTCG');

INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'reddit_subreddit', 'r/mtg', 'https://www.reddit.com/r/mtg/', true,
  '{"subreddit": "mtg", "sort": "hot", "limit": 25, "priority": 2}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_sources WHERE type = 'reddit_subreddit' AND name = 'r/mtg');

INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'reddit_subreddit', 'r/CompetitiveEDH', 'https://www.reddit.com/r/CompetitiveEDH/', true,
  '{"subreddit": "CompetitiveEDH", "sort": "hot", "limit": 25, "priority": 2}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_sources WHERE type = 'reddit_subreddit' AND name = 'r/CompetitiveEDH');

INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'reddit_subreddit', 'r/BudgetBrews', 'https://www.reddit.com/r/BudgetBrews/', true,
  '{"subreddit": "BudgetBrews", "sort": "hot", "limit": 25, "priority": 2}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_sources WHERE type = 'reddit_subreddit' AND name = 'r/BudgetBrews');

INSERT INTO public.marketing_sources (type, name, url, enabled, metadata)
SELECT 'reddit_subreddit', 'r/mtgfinance', 'https://www.reddit.com/r/mtgfinance/', true,
  '{"subreddit": "mtgfinance", "sort": "hot", "limit": 25, "priority": 3}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_sources WHERE type = 'reddit_subreddit' AND name = 'r/mtgfinance');
