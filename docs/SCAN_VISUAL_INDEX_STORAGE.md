# Scan visual index — Supabase Storage

**Do not run without review.** Apply via Supabase SQL editor or migration after approval.

## Bucket

- Name: `scan-index`
- Public read for `manifest.json` and `v*/scan-index-*.bin`
- Writes: service role only (cron)

```sql
-- Example: create bucket (adjust if your project uses storage.buckets API)
insert into storage.buckets (id, name, public)
values ('scan-index', 'scan-index', true)
on conflict (id) do update set public = true;

-- Public read for manifest and index binaries by path (no bucket listing).
-- See frontend/db/migrations/118_security_advisor_phase_b_writes.sql
create policy "scan_index_public_object_read"
on storage.objects for select
to public
using (
  bucket_id = 'scan-index'
  and (
    name = 'manifest.json'
    or name ~ '^v[0-9]+/scan-index-[ab]\.bin$'
  )
);

-- Service role bypasses RLS for cron uploads
```

## Cron

`POST /api/cron/scan-visual-index` with cron auth.

Query `?limit=500` for a partial test build.

Env:

- `SCAN_VISUAL_INDEX_VERSION` (default `1`) — bump when binaries change so mobile cache keys refresh.
- `SCAN_VISUAL_INDEX_IMAGE_SOURCE` — `normal` (default, full Scryfall card image) or `art_crop` (illustration only).

`manifest.json` includes `imageSource` so the app matches query prep to the built index.

Outputs:

- `manifest.json` (`imageSource`, `cardCount`, `a`/`b` URLs)
- `v{N}/scan-index-a.bin` (dHash, magic `MTSA`)
- `v{N}/scan-index-b.bin` (768-dim grid embed, magic `MTSB`)

## Mobile

Set `EXPO_PUBLIC_SCAN_INDEX_MANIFEST_URL` to the public URL of `manifest.json`.
