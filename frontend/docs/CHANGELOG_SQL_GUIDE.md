# Adding Changelog Entries via SQL

This guide explains how to add new entries to the ManaTap "What's New" changelog using Supabase SQL Editor.

## Overview

The changelog is stored in the `app_config` table under the key `'changelog'`. It's a JSONB column with this structure:

```json
{
  "entries": [
    {
      "version": "v1.12.0",
      "date": "2026-02-26",
      "title": "Feature Title Here",
      "type": "feature|improvement|fix",
      "description": "A paragraph describing the release...",
      "features": ["New feature 1", "New feature 2"],
      "improvements": ["Improvement 1", "Improvement 2"],
      "fixes": ["Bug fix 1", "Bug fix 2"]
    }
  ],
  "last_updated": "2026-02-26T12:00:00Z"
}
```

## How to Add a New Entry

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Use the Template

Copy and modify this SQL template:

```sql
-- Changelog Update: [Your Title Here]
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  current_changelog JSONB;
  new_entry JSONB;
  updated_changelog JSONB;
BEGIN
  -- Get current changelog
  SELECT value INTO current_changelog
  FROM app_config
  WHERE key = 'changelog';

  -- Create new entry (MODIFY THIS SECTION)
  new_entry := jsonb_build_object(
    'version', 'v1.X.0',           -- Increment version number
    'date', '2026-MM-DD',          -- Today's date in YYYY-MM-DD
    'title', 'Your Release Title',
    'type', 'feature',             -- 'feature', 'improvement', or 'fix'
    'description', 'A brief paragraph describing what this release is about. Use two single quotes ('') for apostrophes.',
    'features', jsonb_build_array(
      'New feature description 1',
      'New feature description 2'
      -- Add more as needed, or remove this section if none
    ),
    'improvements', jsonb_build_array(
      'Improvement description 1',
      'Improvement description 2'
      -- Add more as needed, or remove this section if none
    ),
    'fixes', jsonb_build_array(
      'Bug fix description 1',
      'Bug fix description 2'
      -- Add more as needed, or remove this section if none
    )
  );

  -- Prepend new entry to existing entries (newest first)
  IF current_changelog IS NULL OR current_changelog->'entries' IS NULL THEN
    updated_changelog := jsonb_build_object(
      'entries', jsonb_build_array(new_entry),
      'last_updated', NOW()::text
    );
  ELSE
    updated_changelog := jsonb_set(
      current_changelog,
      '{entries}',
      jsonb_build_array(new_entry) || (current_changelog->'entries')
    );
    updated_changelog := jsonb_set(
      updated_changelog,
      '{last_updated}',
      to_jsonb(NOW()::text)
    );
  END IF;

  -- Upsert the changelog
  INSERT INTO app_config (key, value, updated_at)
  VALUES ('changelog', updated_changelog, NOW())
  ON CONFLICT (key)
  DO UPDATE SET
    value = updated_changelog,
    updated_at = NOW();

  RAISE NOTICE 'Changelog updated successfully!';
END $$;
```

### Step 3: Run the Query

1. Click **Run** or press `Cmd/Ctrl + Enter`
2. Check the "Messages" tab for the success notice
3. Visit `/changelog` on your site to verify

## Tips & Best Practices

### Versioning Convention
- **Major features**: Increment minor version (v1.11.0 → v1.12.0)
- **Bug fixes only**: Increment patch version (v1.12.0 → v1.12.1)
- **Breaking changes**: Increment major version (v1.x → v2.0.0)

### Writing Good Entries
- **Title**: Keep it short and catchy (3-6 words)
- **Description**: 1-2 sentences explaining the "why" behind the release
- **Features**: Use action verbs, be specific about what users can do
- **Improvements**: Focus on UX enhancements and performance
- **Fixes**: Be honest about bugs fixed; users appreciate transparency

### Escaping Special Characters
- Use `''` (two single quotes) for apostrophes in strings
- Example: `'We''ve added new features'`

### Adding Emojis
Emojis work great in feature lists:
```sql
'features', jsonb_build_array(
  '✨ New shiny feature',
  '🚀 Performance boost',
  '🔧 Quality of life improvement'
)
```

## Viewing Current Changelog

To see what's currently in the changelog:

```sql
SELECT value
FROM app_config
WHERE key = 'changelog';
```

## Removing an Entry

To remove the most recent entry:

```sql
UPDATE app_config
SET value = jsonb_set(
  value,
  '{entries}',
  (value->'entries') - 0  -- Removes first (newest) entry
),
updated_at = NOW()
WHERE key = 'changelog';
```

## Alternative: Admin UI

You can also manage changelog entries through the admin panel at `/admin/changelog`. The SQL method is useful for:
- Bulk updates
- Scripted deployments
- CI/CD pipelines
- When the admin UI is unavailable

## File Location

Migration files for changelog entries are stored in:
```
frontend/db/migrations/0XX_changelog_*.sql
```

Name them with the next available number and a descriptive suffix.
