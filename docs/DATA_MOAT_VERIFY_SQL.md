# Data Moat — SQL to verify in Supabase

After running the 4× "Run" actions on **Admin → Data Dashboard → Test**, run these in the Supabase SQL editor to confirm rows exist.

---

## 1. ai_suggestion_outcomes (test row with outcome_source = 'admin_test')

```sql
SELECT id, suggestion_id, suggested_card, category, outcome_source, created_at
FROM ai_suggestion_outcomes
WHERE outcome_source = 'admin_test'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 2. meta_signals_history (today’s snapshots)

```sql
SELECT id, snapshot_date, signal_type, created_at
FROM meta_signals_history
WHERE snapshot_date = CURRENT_DATE
ORDER BY signal_type;
```

---

## 3. commander_aggregates_history (today’s snapshots)

```sql
SELECT id, snapshot_date, commander_slug, deck_count, created_at
FROM commander_aggregates_history
WHERE snapshot_date = CURRENT_DATE
ORDER BY deck_count DESC NULLS LAST
LIMIT 10;
```

---

## 4. deck_metrics_snapshot (today’s rows)

```sql
SELECT deck_id, snapshot_date, format, commander, land_count, ramp_count, removal_count, draw_count, created_at
FROM deck_metrics_snapshot
WHERE snapshot_date = CURRENT_DATE
ORDER BY created_at DESC
LIMIT 10;
```

---

If any query returns no rows, that table isn’t being written to (check API response on the Test page and service-role permissions).
