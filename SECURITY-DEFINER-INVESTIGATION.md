# Security Definer Views Investigation

## 🔒 Backups Created

### GitHub Backup
✅ **Branch**: `backup-pre-security-definer-fix-oct29`  
✅ **Pushed to**: GitHub remote  
✅ **Restore**: `git checkout backup-pre-security-definer-fix-oct29`

### Database Investigation
📋 **SQL File**: `check-security-definer-views.sql`

---

## 📊 Views to Investigate

1. **`collection_card_enriched`** - Collection data with card details
2. **`ai_persona_usage_30d`** - AI usage stats (30 days)
3. **`ai_persona_usage_daily`** - AI usage stats (daily)
4. **`collection_public_lookup`** - Public collection lookup

---

## 🔍 Investigation Steps

### Step 1: Run the Investigation SQL

1. Open **Supabase SQL Editor**
2. Copy/paste contents of `check-security-definer-views.sql`
3. Run all queries
4. Review the output to understand:
   - What data each view accesses
   - Which tables they depend on
   - Their current definitions

### Step 2: Analyze Results

For each view, determine:

**❓ Questions to Answer:**
- [ ] Does it access sensitive user data?
- [ ] Does it need to bypass RLS for a legitimate reason?
- [ ] Could it be rewritten without SECURITY DEFINER?
- [ ] Is it used in public-facing features?

**🎯 Decision Matrix:**

| Risk Level | Action |
|------------|--------|
| **LOW** - View only accesses public/aggregate data | ✅ Safe to remove SECURITY DEFINER |
| **MEDIUM** - View accesses user data but has filters | ⚠️ Need to add RLS policies after fixing |
| **HIGH** - View needs admin/cross-user access | 🛑 Keep SECURITY DEFINER but document why |

---

## 🛠️ Common Fix Patterns

### Pattern 1: Analytics View (Safe)
```sql
-- BEFORE (SECURITY DEFINER)
CREATE VIEW ai_persona_usage_30d WITH (security_barrier) AS
SELECT persona_id, COUNT(*) as usage_count
FROM ai_usage
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY persona_id;

-- AFTER (No SECURITY DEFINER needed - it's aggregate data)
CREATE OR REPLACE VIEW ai_persona_usage_30d AS
SELECT persona_id, COUNT(*) as usage_count
FROM ai_usage
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY persona_id;
```

### Pattern 2: Enriched Data View (Needs RLS)
```sql
-- BEFORE (SECURITY DEFINER)
CREATE VIEW collection_card_enriched WITH (security_barrier) AS
SELECT 
  cc.*,
  sc.art_crop,
  sc.type_line
FROM collection_cards cc
LEFT JOIN scryfall_cache sc ON sc.name = cc.name;

-- AFTER (Remove SECURITY DEFINER + Add RLS to underlying table)
CREATE OR REPLACE VIEW collection_card_enriched AS
SELECT 
  cc.*,
  sc.art_crop,
  sc.type_line
FROM collection_cards cc
LEFT JOIN scryfall_cache sc ON sc.name = cc.name;

-- Then ensure collection_cards has RLS:
ALTER TABLE collection_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own collection cards"
  ON collection_cards FOR SELECT
  USING (
    collection_id IN (
      SELECT id FROM collections WHERE user_id = auth.uid()
    )
  );
```

### Pattern 3: Public Lookup (Keep SECURITY DEFINER)
```sql
-- This view SHOULD keep SECURITY DEFINER because it needs to
-- access all collections to find public ones
CREATE OR REPLACE VIEW collection_public_lookup 
WITH (security_barrier) AS
SELECT c.id, c.name, cm.public_slug
FROM collections c
JOIN collection_meta cm ON cm.collection_id = c.id
WHERE cm.is_public = true;
```

---

## ⚡ Quick Decision Guide

### 🟢 **SAFE TO FIX** (Remove SECURITY DEFINER):
- Views that only show aggregate/stats data
- Views that don't access user-specific data
- Views where RLS on underlying tables is sufficient

### 🟡 **NEEDS REVIEW** (Fix with RLS policies):
- Views that join user data with reference data
- Views that filter by user_id or auth.uid()
- Views used in authenticated endpoints

### 🔴 **KEEP AS-IS** (Document why):
- Admin analytics views
- Cross-user lookup tables (like public collections)
- System/monitoring views

---

## 📝 Next Steps After Investigation

1. **Document findings** in this file
2. **Decide** which views to fix
3. **Create fix SQL** for approved changes
4. **Test** in development first
5. **Apply** to production
6. **Verify** no features broke

---

## 🆘 Rollback Plan

If something breaks:

```sql
-- Restore from GitHub backup
git checkout backup-pre-security-definer-fix-oct29

-- Or restore individual view from backup
-- (Use output from Query #4 in check-security-definer-views.sql)
```

---

## 📋 Investigation Results

### View 1: `collection_card_enriched`
**Purpose**: _[Fill in after investigation]_  
**Accesses**: _[Tables used]_  
**Decision**: _[Keep/Fix/Remove]_  
**Reasoning**: _[Why]_

### View 2: `ai_persona_usage_30d`
**Purpose**: _[Fill in after investigation]_  
**Accesses**: _[Tables used]_  
**Decision**: _[Keep/Fix/Remove]_  
**Reasoning**: _[Why]_

### View 3: `ai_persona_usage_daily`
**Purpose**: _[Fill in after investigation]_  
**Accesses**: _[Tables used]_  
**Decision**: _[Keep/Fix/Remove]_  
**Reasoning**: _[Why]_

### View 4: `collection_public_lookup`
**Purpose**: _[Fill in after investigation]_  
**Accesses**: _[Tables used]_  
**Decision**: _[Keep/Fix/Remove]_  
**Reasoning**: _[Why]_

---

## ✅ When Investigation is Complete

Run the investigation SQL, fill in the results above, then decide on the fix approach!

